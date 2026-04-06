
-- 1. Make expiry_date nullable
ALTER TABLE public.inventory_batches ALTER COLUMN expiry_date DROP NOT NULL;

-- 2. Create invoice_sequences table for deterministic numbering
CREATE TABLE public.invoice_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prefix text NOT NULL DEFAULT 'INV',
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, prefix, year)
);

ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own company sequences" ON public.invoice_sequences
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Manage own company sequences" ON public.invoice_sequences
  FOR ALL USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

-- 3. Function: get next invoice number (sequential, deterministic)
CREATE OR REPLACE FUNCTION public.get_next_invoice_number(_company_id uuid, _prefix text DEFAULT 'INV')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _year integer;
  _next integer;
BEGIN
  _year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  
  INSERT INTO public.invoice_sequences (company_id, prefix, year, last_number)
  VALUES (_company_id, _prefix, _year, 1)
  ON CONFLICT (company_id, prefix, year)
  DO UPDATE SET last_number = invoice_sequences.last_number + 1, updated_at = now()
  RETURNING last_number INTO _next;
  
  RETURN _prefix || '-' || _year || '-' || LPAD(_next::text, 4, '0');
END;
$$;

-- 4. Updated receive_purchase_batches: MRP fallback, no random batch/expiry
CREATE OR REPLACE FUNCTION public.receive_purchase_batches(_batches jsonb, _purchase_order_id uuid DEFAULT NULL::uuid)
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
  _effective_batch_number text;
BEGIN
  FOR _batch IN SELECT * FROM jsonb_array_elements(_batches)
  LOOP
    _product_id := (_batch->>'product_id')::uuid;
    _batch_number := NULLIF(TRIM(_batch->>'batch_number'), '');
    _quantity := COALESCE((_batch->>'quantity')::integer, 0);
    _purchase_price := COALESCE((_batch->>'purchase_price')::numeric, 0);
    _mrp := COALESCE((_batch->>'mrp')::numeric, 0);
    _expiry_date := (_batch->>'expiry_date')::date;  -- Can be NULL
    _manufacturing_date := (_batch->>'manufacturing_date')::date;
    _supplier_id := (_batch->>'supplier_id')::uuid;
    _company_id := (_batch->>'company_id')::uuid;

    IF _quantity <= 0 THEN
      CONTINUE;
    END IF;

    _is_user_provided := _batch_number IS NOT NULL;

    IF _is_user_provided THEN
      _effective_batch_number := _batch_number;
    ELSE
      -- MRP-based fallback: use MRP_ prefix as batch identifier
      _effective_batch_number := 'MRP_' || _mrp::text;
      _expiry_date := NULL;  -- No expiry for MRP-based batches
    END IF;

    -- Check if exact batch exists (product + batch_number + mrp + company)
    SELECT id INTO _existing_batch_id
    FROM public.inventory_batches
    WHERE product_id = _product_id
      AND batch_number = _effective_batch_number
      AND mrp = _mrp
      AND company_id = _company_id
    FOR UPDATE
    LIMIT 1;

    IF _existing_batch_id IS NOT NULL THEN
      -- Merge into existing batch
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
        'action', 'merged',
        'batch_number', _effective_batch_number,
        'quantity_added', _quantity
      );
    ELSE
      -- Create new batch
      INSERT INTO public.inventory_batches (
        product_id, batch_number, quantity, purchase_price, mrp,
        expiry_date, manufacturing_date, supplier_id, company_id, received_date
      ) VALUES (
        _product_id, _effective_batch_number, _quantity, _purchase_price, _mrp,
        _expiry_date, _manufacturing_date, _supplier_id, _company_id, CURRENT_DATE
      )
      RETURNING id INTO _new_batch_id;

      _results := _results || jsonb_build_object(
        'batch_id', _new_batch_id,
        'action', 'created',
        'batch_number', _effective_batch_number,
        'quantity_added', _quantity
      );
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

-- 5. Update allocate_batches_fifo to handle nullable expiry (MRP batches last)
CREATE OR REPLACE FUNCTION public.allocate_batches_fifo(_product_id uuid, _requested_quantity integer, _company_id uuid, _exclude_batch_quantities jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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

  -- Calculate total available (include both expiry and MRP-only batches)
  FOR _batch IN
    SELECT id, batch_number, quantity, expiry_date, mrp, purchase_price
    FROM public.inventory_batches
    WHERE product_id = _product_id
      AND company_id = _company_id
      AND (expiry_date > CURRENT_DATE OR expiry_date IS NULL)
      AND quantity > 0
    ORDER BY 
      CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,  -- Expiry batches first
      expiry_date ASC NULLS LAST
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

  -- Allocate FIFO (expiry batches first, then MRP-only batches)
  FOR _batch IN
    SELECT id, batch_number, quantity, expiry_date, mrp, purchase_price
    FROM public.inventory_batches
    WHERE product_id = _product_id
      AND company_id = _company_id
      AND (expiry_date > CURRENT_DATE OR expiry_date IS NULL)
      AND quantity > 0
    ORDER BY 
      CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
      expiry_date ASC NULLS LAST
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
