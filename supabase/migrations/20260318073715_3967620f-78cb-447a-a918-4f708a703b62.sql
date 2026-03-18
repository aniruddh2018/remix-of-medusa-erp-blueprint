
-- ============================================================
-- 1. deduct_sale_inventory: Multi-batch FIFO deduction with row locking
--    Handles quantity + free_quantity, returns allocation details
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_sale_inventory(
  _items jsonb -- array of {product_id, batch_id, quantity, free_quantity}
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _item jsonb;
  _batch_id uuid;
  _total_deduct integer;
  _current_qty integer;
  _new_qty integer;
  _results jsonb := '[]'::jsonb;
BEGIN
  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _batch_id := (_item->>'batch_id')::uuid;
    _total_deduct := COALESCE((_item->>'quantity')::integer, 0) 
                   + COALESCE((_item->>'free_quantity')::integer, 0);

    IF _total_deduct <= 0 THEN
      CONTINUE;
    END IF;

    -- Lock the row
    SELECT quantity INTO _current_qty
    FROM public.inventory_batches
    WHERE id = _batch_id
    FOR UPDATE;

    IF _current_qty IS NULL THEN
      RAISE EXCEPTION 'Batch not found: %', _batch_id;
    END IF;

    IF _current_qty < _total_deduct THEN
      RAISE EXCEPTION 'Insufficient stock in batch %. Available: %, Requested: %', 
        _batch_id, _current_qty, _total_deduct;
    END IF;

    _new_qty := _current_qty - _total_deduct;

    UPDATE public.inventory_batches
    SET quantity = _new_qty, updated_at = now()
    WHERE id = _batch_id;

    _results := _results || jsonb_build_object(
      'batch_id', _batch_id,
      'deducted', _total_deduct,
      'remaining', _new_qty
    );
  END LOOP;

  RETURN _results;
END;
$$;

-- ============================================================
-- 2. restore_sale_inventory: Restore stock when deleting/editing a sale
--    Handles quantity + free_quantity
-- ============================================================
CREATE OR REPLACE FUNCTION public.restore_sale_inventory(
  _items jsonb -- array of {batch_id, quantity, free_quantity}
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _item jsonb;
  _batch_id uuid;
  _total_restore integer;
BEGIN
  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _batch_id := (_item->>'batch_id')::uuid;
    _total_restore := COALESCE((_item->>'quantity')::integer, 0) 
                    + COALESCE((_item->>'free_quantity')::integer, 0);

    IF _total_restore <= 0 THEN
      CONTINUE;
    END IF;

    -- Lock and update
    UPDATE public.inventory_batches
    SET quantity = quantity + _total_restore, updated_at = now()
    WHERE id = _batch_id;
  END LOOP;
END;
$$;

-- ============================================================
-- 3. receive_purchase_batches: Smart batch creation/merge for purchases
--    - If batch_number provided: create/update that specific batch
--    - If no batch_number + same MRP exists: merge into existing batch
--    - If no batch_number + different MRP: create new batch
-- ============================================================
CREATE OR REPLACE FUNCTION public.receive_purchase_batches(
  _batches jsonb, -- array of {product_id, batch_number, quantity, purchase_price, mrp, expiry_date, manufacturing_date, supplier_id, company_id}
  _purchase_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _batch jsonb;
  _product_id uuid;
  _batch_number text;
  _quantity integer;
  _purchase_price numeric;
  _mrp numeric;
  _expiry_date date;
  _manufacturing_date date;
  _supplier_id uuid;
  _company_id uuid;
  _existing_batch_id uuid;
  _new_batch_id uuid;
  _results jsonb := '[]'::jsonb;
  _is_user_provided boolean;
BEGIN
  FOR _batch IN SELECT * FROM jsonb_array_elements(_batches)
  LOOP
    _product_id := (_batch->>'product_id')::uuid;
    _batch_number := NULLIF(TRIM(_batch->>'batch_number'), '');
    _quantity := COALESCE((_batch->>'quantity')::integer, 0);
    _purchase_price := COALESCE((_batch->>'purchase_price')::numeric, 0);
    _mrp := COALESCE((_batch->>'mrp')::numeric, 0);
    _expiry_date := (_batch->>'expiry_date')::date;
    _manufacturing_date := (_batch->>'manufacturing_date')::date;
    _supplier_id := (_batch->>'supplier_id')::uuid;
    _company_id := (_batch->>'company_id')::uuid;

    IF _quantity <= 0 THEN
      CONTINUE;
    END IF;

    _is_user_provided := _batch_number IS NOT NULL;

    IF _is_user_provided THEN
      -- User provided batch number: check if this exact batch exists
      SELECT id INTO _existing_batch_id
      FROM public.inventory_batches
      WHERE product_id = _product_id
        AND batch_number = _batch_number
        AND company_id = _company_id
      FOR UPDATE
      LIMIT 1;

      IF _existing_batch_id IS NOT NULL THEN
        -- Merge into existing batch
        UPDATE public.inventory_batches
        SET quantity = quantity + _quantity,
            purchase_price = _purchase_price,
            mrp = _mrp,
            expiry_date = COALESCE(_expiry_date, expiry_date),
            manufacturing_date = COALESCE(_manufacturing_date, manufacturing_date),
            supplier_id = COALESCE(_supplier_id, supplier_id),
            updated_at = now()
        WHERE id = _existing_batch_id;

        _results := _results || jsonb_build_object(
          'batch_id', _existing_batch_id,
          'action', 'merged',
          'batch_number', _batch_number,
          'quantity_added', _quantity
        );
      ELSE
        -- Create new batch with user-provided number
        INSERT INTO public.inventory_batches (
          product_id, batch_number, quantity, purchase_price, mrp,
          expiry_date, manufacturing_date, supplier_id, company_id, received_date
        ) VALUES (
          _product_id, _batch_number, _quantity, _purchase_price, _mrp,
          COALESCE(_expiry_date, CURRENT_DATE + INTERVAL '2 years'),
          _manufacturing_date, _supplier_id, _company_id, CURRENT_DATE
        )
        RETURNING id INTO _new_batch_id;

        _results := _results || jsonb_build_object(
          'batch_id', _new_batch_id,
          'action', 'created',
          'batch_number', _batch_number,
          'quantity_added', _quantity
        );
      END IF;

    ELSE
      -- No batch number provided: check if batch with same MRP exists for this product
      SELECT id INTO _existing_batch_id
      FROM public.inventory_batches
      WHERE product_id = _product_id
        AND company_id = _company_id
        AND mrp = _mrp
        AND quantity > 0
      ORDER BY created_at DESC
      FOR UPDATE
      LIMIT 1;

      IF _existing_batch_id IS NOT NULL THEN
        -- Same MRP exists: merge stock
        UPDATE public.inventory_batches
        SET quantity = quantity + _quantity,
            purchase_price = _purchase_price,
            expiry_date = COALESCE(_expiry_date, expiry_date),
            manufacturing_date = COALESCE(_manufacturing_date, manufacturing_date),
            supplier_id = COALESCE(_supplier_id, supplier_id),
            updated_at = now()
        WHERE id = _existing_batch_id;

        _results := _results || jsonb_build_object(
          'batch_id', _existing_batch_id,
          'action', 'merged_by_mrp',
          'quantity_added', _quantity
        );
      ELSE
        -- Different MRP or no existing batch: create new
        _batch_number := 'SYS-' || EXTRACT(EPOCH FROM now())::bigint || '-' || 
                         SUBSTR(gen_random_uuid()::text, 1, 4);
        
        INSERT INTO public.inventory_batches (
          product_id, batch_number, quantity, purchase_price, mrp,
          expiry_date, manufacturing_date, supplier_id, company_id, received_date
        ) VALUES (
          _product_id, _batch_number, _quantity, _purchase_price, _mrp,
          COALESCE(_expiry_date, CURRENT_DATE + INTERVAL '2 years'),
          _manufacturing_date, _supplier_id, _company_id, CURRENT_DATE
        )
        RETURNING id INTO _new_batch_id;

        _results := _results || jsonb_build_object(
          'batch_id', _new_batch_id,
          'action', 'created_new_mrp',
          'batch_number', _batch_number,
          'quantity_added', _quantity
        );
      END IF;
    END IF;
  END LOOP;

  -- Update purchase order status if provided
  IF _purchase_order_id IS NOT NULL THEN
    UPDATE public.purchase_orders
    SET status = 'delivered', updated_at = now()
    WHERE id = _purchase_order_id;
  END IF;

  RETURN _results;
END;
$$;

-- ============================================================
-- 4. allocate_batches_fifo: Server-side FIFO batch allocation
--    Returns allocation plan without modifying stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.allocate_batches_fifo(
  _product_id uuid,
  _requested_quantity integer,
  _company_id uuid,
  _exclude_batch_quantities jsonb DEFAULT '{}'::jsonb -- {batch_id: already_allocated_qty}
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _batch record;
  _remaining integer := _requested_quantity;
  _available integer;
  _allocate integer;
  _cart_qty integer;
  _allocations jsonb := '[]'::jsonb;
  _total_available integer := 0;
BEGIN
  IF _requested_quantity <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'allocations', '[]'::jsonb,
      'total_allocated', 0,
      'shortfall', _requested_quantity,
      'message', 'Quantity must be greater than 0'
    );
  END IF;

  -- Calculate total available
  FOR _batch IN
    SELECT id, batch_number, quantity, expiry_date, mrp, purchase_price
    FROM public.inventory_batches
    WHERE product_id = _product_id
      AND company_id = _company_id
      AND expiry_date > CURRENT_DATE
      AND quantity > 0
    ORDER BY expiry_date ASC
  LOOP
    _cart_qty := COALESCE((_exclude_batch_quantities->>_batch.id::text)::integer, 0);
    _available := GREATEST(0, _batch.quantity - _cart_qty);
    _total_available := _total_available + _available;
  END LOOP;

  IF _total_available < _requested_quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'allocations', '[]'::jsonb,
      'total_allocated', 0,
      'shortfall', _requested_quantity - _total_available,
      'message', format('Insufficient stock. Only %s units available.', _total_available)
    );
  END IF;

  -- Allocate FIFO
  FOR _batch IN
    SELECT id, batch_number, quantity, expiry_date, mrp, purchase_price
    FROM public.inventory_batches
    WHERE product_id = _product_id
      AND company_id = _company_id
      AND expiry_date > CURRENT_DATE
      AND quantity > 0
    ORDER BY expiry_date ASC
  LOOP
    IF _remaining <= 0 THEN EXIT; END IF;

    _cart_qty := COALESCE((_exclude_batch_quantities->>_batch.id::text)::integer, 0);
    _available := GREATEST(0, _batch.quantity - _cart_qty);

    IF _available <= 0 THEN CONTINUE; END IF;

    _allocate := LEAST(_remaining, _available);

    _allocations := _allocations || jsonb_build_object(
      'batch_id', _batch.id,
      'batch_number', _batch.batch_number,
      'quantity', _allocate,
      'available_quantity', _batch.quantity,
      'expiry_date', _batch.expiry_date,
      'mrp', _batch.mrp,
      'purchase_price', _batch.purchase_price
    );

    _remaining := _remaining - _allocate;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'allocations', _allocations,
    'total_allocated', _requested_quantity - _remaining,
    'shortfall', 0
  );
END;
$$;
