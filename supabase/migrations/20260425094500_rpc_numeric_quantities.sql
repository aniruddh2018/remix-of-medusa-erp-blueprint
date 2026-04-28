-- =========================================================================
-- RPC QUANTITY TYPE HARDENING
--
-- The schema migration 20260425093000_unit_conversion_precision_and_base_stock
-- widened the quantity / conversion_factor columns from integer to
-- numeric(18,6) so that measurable units (ml, g, mcg) and fractional
-- conversions can be represented faithfully.
--
-- The stored procedures, however, still cast the inbound jsonb payload to
-- `integer`. When a caller sends a fractional quantity (e.g. 0.2 ml of a
-- strength, or 0.5 strip returned) Postgres throws:
--
--     invalid input syntax for type integer: "0.2"
--
-- This migration rebuilds every quantity-processing RPC to use `numeric`
-- internally and keeps the loose/sealed split arithmetic working for packed
-- products (sealed packs are still whole units — we only pack-break when
-- enough base units are required, using ceiling).
-- =========================================================================

-- 0. Widen the support tables the FIFO helper touches.  We only flip the
--    exclude-map values so the payload can carry fractional reservations
--    alongside the existing integer ones.
ALTER TABLE IF EXISTS public.system_conversions
  ALTER COLUMN conversion_factor TYPE numeric(18,6) USING conversion_factor::numeric(18,6);

ALTER TABLE IF EXISTS public.conversion_audit
  ALTER COLUMN conversion_factor TYPE numeric(18,6) USING conversion_factor::numeric(18,6);

-- 1. deduct_sale_inventory ------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_sale_inventory(_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item jsonb;
  _batch_id uuid;
  _product_id uuid;
  _qty numeric;
  _free_qty numeric;
  _base_qty numeric;
  _total_deduct numeric;
  _sealed numeric;
  _loose numeric;
  _pack numeric;
  _need numeric;
  _broken numeric;
  _batch_company uuid;
  _batch_expiry date;
  _caller_company uuid;
  _caller uuid;
  _block_expired boolean;
  _product_expiry_required boolean;
  _enforce_expiry boolean;
  _reference_id uuid;
  _unit_price numeric;
  _results jsonb := '[]'::jsonb;
BEGIN
  _caller := auth.uid();
  _caller_company := public.get_user_company_id(_caller);
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT block_expired_sales INTO _block_expired
  FROM public.invoice_settings WHERE company_id = _caller_company;
  _block_expired := COALESCE(_block_expired, true);

  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _batch_id    := (_item->>'batch_id')::uuid;
    _qty         := COALESCE((_item->>'quantity')::numeric, 0);
    _free_qty    := COALESCE((_item->>'free_quantity')::numeric, 0);
    _base_qty    := COALESCE((_item->>'base_quantity')::numeric, _qty + _free_qty);
    _total_deduct := _qty + _free_qty;
    _reference_id := (_item->>'reference_id')::uuid;
    _unit_price  := COALESCE((_item->>'unit_price')::numeric, 0);

    IF _base_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT b.quantity, b.loose_quantity, b.pack_size, b.company_id, b.expiry_date, b.product_id
    INTO _sealed, _loose, _pack, _batch_company, _batch_expiry, _product_id
    FROM public.inventory_batches b
    WHERE b.id = _batch_id
    FOR UPDATE;

    IF _sealed IS NULL THEN
      RAISE EXCEPTION 'Batch not found: %', _batch_id;
    END IF;

    IF _batch_company IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(_caller) THEN
      RAISE EXCEPTION 'Unauthorized: batch belongs to another company';
    END IF;

    SELECT expiry_required INTO _product_expiry_required FROM public.products WHERE id = _product_id;
    _enforce_expiry := _block_expired OR COALESCE(_product_expiry_required, false);

    IF _enforce_expiry AND _batch_expiry IS NOT NULL AND _batch_expiry <= CURRENT_DATE THEN
      RAISE EXCEPTION 'Cannot sell from expired batch (expired %)', _batch_expiry;
    END IF;

    IF (_loose + _sealed * COALESCE(_pack, 1)) < _base_qty THEN
      RAISE EXCEPTION 'Insufficient stock in batch %. Available: % base units, Requested: %',
        _batch_id, _loose + _sealed * COALESCE(_pack, 1), _base_qty;
    END IF;

    _need := _base_qty;
    _broken := 0;

    -- Take from loose first (loose can be fractional for measurable units).
    IF _loose >= _need THEN
      _loose := _loose - _need;
      _need := 0;
    ELSE
      _need := _need - _loose;
      _loose := 0;
    END IF;

    -- Break open sealed packs only when we still need more base units.
    -- Sealed packs remain whole (you can't break half a strip), so ceiling.
    IF _need > 0 THEN
      IF COALESCE(_pack, 0) <= 0 THEN
        -- No pack defined: treat sealed as base units 1:1.
        _sealed := _sealed - _need;
        _need := 0;
      ELSE
        _broken := CEIL(_need / _pack);
        _sealed := _sealed - _broken;
        _loose := (_broken * _pack) - _need;
        _need := 0;
      END IF;
    END IF;

    UPDATE public.inventory_batches
    SET quantity = _sealed, loose_quantity = _loose, updated_at = now()
    WHERE id = _batch_id;

    INSERT INTO public.inventory_transactions
      (company_id, product_id, batch_id, transaction_type, quantity, rate, reference_type, reference_id, created_by, notes)
    VALUES
      (_caller_company, _product_id, _batch_id, 'sale', -_total_deduct, _unit_price, 'sales_order', _reference_id, _caller,
       CASE WHEN _broken > 0 THEN format('Broke %s sealed pack(s) into loose', _broken) ELSE NULL END);

    _results := _results || jsonb_build_object(
      'batch_id', _batch_id,
      'deducted_base', _base_qty,
      'sealed_remaining', _sealed,
      'loose_remaining', _loose,
      'packs_broken', _broken
    );
  END LOOP;

  RETURN _results;
END;
$function$;

-- 2. restore_sale_inventory ----------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_sale_inventory(_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item jsonb;
  _batch_id uuid;
  _product_id uuid;
  _total_restore numeric;
  _base_restore numeric;
  _pack numeric;
  _batch_company uuid;
  _caller_company uuid;
  _caller uuid;
  _reference_id uuid;
  _add_sealed numeric := 0;
  _add_loose numeric := 0;
BEGIN
  _caller := auth.uid();
  _caller_company := public.get_user_company_id(_caller);
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _batch_id := (_item->>'batch_id')::uuid;
    _total_restore := COALESCE((_item->>'quantity')::numeric, 0)
                    + COALESCE((_item->>'free_quantity')::numeric, 0);
    _base_restore := COALESCE((_item->>'base_quantity')::numeric, _total_restore);
    _reference_id := (_item->>'reference_id')::uuid;

    IF _base_restore <= 0 THEN CONTINUE; END IF;

    SELECT company_id, product_id, pack_size
    INTO _batch_company, _product_id, _pack
    FROM public.inventory_batches
    WHERE id = _batch_id
    FOR UPDATE;

    IF _batch_company IS NULL THEN
      RAISE EXCEPTION 'Batch not found: %', _batch_id;
    END IF;

    IF _batch_company IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(_caller) THEN
      RAISE EXCEPTION 'Unauthorized: batch belongs to another company';
    END IF;

    -- Reform sealed packs from full multiples; remainder + fractional remnant
    -- go to loose. For packed discrete products sealed is still floor-whole.
    IF COALESCE(_pack, 0) > 0 THEN
      _add_sealed := FLOOR(_base_restore / _pack);
      _add_loose := _base_restore - (_add_sealed * _pack);
    ELSE
      _add_sealed := _base_restore;
      _add_loose := 0;
    END IF;

    UPDATE public.inventory_batches
    SET quantity = quantity + _add_sealed,
        loose_quantity = loose_quantity + _add_loose,
        updated_at = now()
    WHERE id = _batch_id;

    INSERT INTO public.inventory_transactions
      (company_id, product_id, batch_id, transaction_type, quantity, reference_type, reference_id, created_by)
    VALUES
      (_caller_company, _product_id, _batch_id, 'sale_return', _total_restore, 'sales_order', _reference_id, _caller);
  END LOOP;
END;
$function$;

-- 3. receive_purchase_batches — fractional quantities (ml/g/fractional packs)
CREATE OR REPLACE FUNCTION public.receive_purchase_batches(_batches jsonb, _purchase_order_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _batch jsonb;
  _product_id uuid;
  _batch_number text;
  _quantity numeric;
  _purchase_price numeric;
  _mrp numeric;
  _expiry_date date;
  _manufacturing_date date;
  _supplier_id uuid;
  _company_id uuid;
  _caller_company uuid;
  _caller uuid;
  _existing_batch_id uuid;
  _new_batch_id uuid;
  _target_batch_id uuid;
  _results jsonb := '[]'::jsonb;
  _is_user_provided boolean;
  _effective_batch_number text;
BEGIN
  _caller := auth.uid();
  _caller_company := public.get_user_company_id(_caller);
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF _purchase_order_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE id = _purchase_order_id
        AND (company_id = _caller_company OR public.is_super_admin(_caller))
    ) THEN
      RAISE EXCEPTION 'Unauthorized: purchase order belongs to another company';
    END IF;
  END IF;

  FOR _batch IN SELECT * FROM jsonb_array_elements(_batches)
  LOOP
    _product_id := (_batch->>'product_id')::uuid;
    _batch_number := NULLIF(TRIM(_batch->>'batch_number'), '');
    _quantity := COALESCE((_batch->>'quantity')::numeric, 0);
    _purchase_price := COALESCE((_batch->>'purchase_price')::numeric, 0);
    _mrp := COALESCE((_batch->>'mrp')::numeric, 0);
    _expiry_date := (_batch->>'expiry_date')::date;
    _manufacturing_date := (_batch->>'manufacturing_date')::date;
    _supplier_id := (_batch->>'supplier_id')::uuid;
    _company_id := (_batch->>'company_id')::uuid;

    IF _quantity <= 0 THEN CONTINUE; END IF;

    IF _company_id IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(_caller) THEN
      _company_id := _caller_company;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = _product_id
        AND (company_id = _caller_company OR public.is_super_admin(_caller))
    ) THEN
      RAISE EXCEPTION 'Unauthorized: product % does not belong to caller company', _product_id;
    END IF;

    _is_user_provided := _batch_number IS NOT NULL;
    IF _is_user_provided THEN
      _effective_batch_number := _batch_number;
    ELSE
      _effective_batch_number := 'MRP_' || _mrp::text;
      _expiry_date := NULL;
    END IF;

    SELECT id INTO _existing_batch_id
    FROM public.inventory_batches
    WHERE product_id = _product_id
      AND batch_number = _effective_batch_number
      AND mrp = _mrp
      AND company_id = _company_id
    FOR UPDATE
    LIMIT 1;

    IF _existing_batch_id IS NOT NULL THEN
      UPDATE public.inventory_batches
      SET quantity = quantity + _quantity,
          purchase_price = _purchase_price,
          expiry_date = COALESCE(_expiry_date, expiry_date),
          manufacturing_date = COALESCE(_manufacturing_date, manufacturing_date),
          supplier_id = COALESCE(_supplier_id, supplier_id),
          updated_at = now()
      WHERE id = _existing_batch_id;
      _target_batch_id := _existing_batch_id;

      _results := _results || jsonb_build_object(
        'batch_id', _existing_batch_id, 'action', 'merged',
        'batch_number', _effective_batch_number, 'quantity_added', _quantity
      );
    ELSE
      INSERT INTO public.inventory_batches (
        product_id, batch_number, quantity, purchase_price, mrp,
        expiry_date, manufacturing_date, supplier_id, company_id, received_date
      ) VALUES (
        _product_id, _effective_batch_number, _quantity, _purchase_price, _mrp,
        _expiry_date, _manufacturing_date, _supplier_id, _company_id, CURRENT_DATE
      )
      RETURNING id INTO _new_batch_id;
      _target_batch_id := _new_batch_id;

      _results := _results || jsonb_build_object(
        'batch_id', _new_batch_id, 'action', 'created',
        'batch_number', _effective_batch_number, 'quantity_added', _quantity
      );
    END IF;

    INSERT INTO public.inventory_transactions
      (company_id, product_id, batch_id, transaction_type, quantity, rate, reference_type, reference_id, created_by)
    VALUES
      (_caller_company, _product_id, _target_batch_id, 'purchase', _quantity, _purchase_price, 'purchase_order', _purchase_order_id, _caller);
  END LOOP;

  IF _purchase_order_id IS NOT NULL THEN
    UPDATE public.purchase_orders
    SET status = 'delivered', updated_at = now()
    WHERE id = _purchase_order_id;
  END IF;

  RETURN _results;
END;
$function$;

-- 4. deduct_mixed_stock — used by some direct-batch adjustments.
CREATE OR REPLACE FUNCTION public.deduct_mixed_stock(
  _batch_id uuid,
  _base_quantity numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sealed numeric;
  _loose numeric;
  _pack numeric;
  _company uuid;
  _caller_company uuid;
  _need numeric := _base_quantity;
  _broken numeric := 0;
BEGIN
  IF _base_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be > 0';
  END IF;

  _caller_company := public.get_user_company_id(auth.uid());
  IF _caller_company IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT quantity, loose_quantity, pack_size, company_id
    INTO _sealed, _loose, _pack, _company
  FROM inventory_batches WHERE id = _batch_id FOR UPDATE;

  IF _sealed IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF _company IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: batch belongs to another company';
  END IF;

  IF (_loose + _sealed * COALESCE(_pack,1)) < _need THEN
    RAISE EXCEPTION 'Insufficient stock. Available % base units, requested %',
      _loose + _sealed * COALESCE(_pack,1), _need;
  END IF;

  IF _loose >= _need THEN
    _loose := _loose - _need;
    _need := 0;
  ELSE
    _need := _need - _loose;
    _loose := 0;
  END IF;

  IF _need > 0 THEN
    IF COALESCE(_pack,0) <= 0 THEN
      _sealed := _sealed - _need;
      _need := 0;
    ELSE
      _broken := CEIL(_need / _pack);
      _sealed := _sealed - _broken;
      _loose := (_broken * _pack) - _need;
      _need := 0;
    END IF;
  END IF;

  UPDATE inventory_batches
     SET quantity = _sealed, loose_quantity = _loose, updated_at = now()
   WHERE id = _batch_id;

  RETURN jsonb_build_object(
    'batch_id', _batch_id,
    'sealed_remaining', _sealed,
    'loose_remaining', _loose,
    'packs_broken', _broken
  );
END;
$$;

-- 5. allocate_batches_fifo — exclude map carries numeric reservations now.
CREATE OR REPLACE FUNCTION public.allocate_batches_fifo(
  _product_id uuid,
  _requested_quantity numeric,
  _company_id uuid,
  _exclude_batch_quantities jsonb DEFAULT '{}'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _batch record;
  _remaining numeric := _requested_quantity;
  _available numeric;
  _allocate numeric;
  _cart_qty numeric;
  _allocations jsonb := '[]'::jsonb;
  _total_available numeric := 0;
  _caller_company uuid;
BEGIN
  _caller_company := public.get_user_company_id(auth.uid());
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF _company_id IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: cannot allocate batches for another company';
  END IF;

  IF _requested_quantity <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'allocations', '[]'::jsonb,
      'total_allocated', 0,
      'shortfall', _requested_quantity,
      'message', 'Quantity must be greater than 0'
    );
  END IF;

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
    _cart_qty := COALESCE((_exclude_batch_quantities->>_batch.id::text)::numeric, 0);
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

    _cart_qty := COALESCE((_exclude_batch_quantities->>_batch.id::text)::numeric, 0);
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
$function$;

-- 6. deduct_batch_quantity helper — simple deduction by numeric base qty.
CREATE OR REPLACE FUNCTION public.deduct_batch_quantity(_batch_id uuid, _quantity numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _current_qty numeric;
  _new_qty numeric;
  _batch_company uuid;
  _caller_company uuid;
BEGIN
  _caller_company := public.get_user_company_id(auth.uid());
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT quantity, company_id INTO _current_qty, _batch_company
  FROM public.inventory_batches
  WHERE id = _batch_id
  FOR UPDATE;

  IF _current_qty IS NULL THEN
    RAISE EXCEPTION 'Batch not found: %', _batch_id;
  END IF;

  IF _batch_company IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: batch belongs to another company';
  END IF;

  IF _current_qty < _quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', _current_qty, _quantity;
  END IF;

  _new_qty := _current_qty - _quantity;

  UPDATE public.inventory_batches
  SET quantity = _new_qty, updated_at = now()
  WHERE id = _batch_id;

  RETURN _new_qty;
END;
$function$;
