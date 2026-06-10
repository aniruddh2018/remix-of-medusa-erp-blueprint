-- ============================================================================
-- Fix: Update receive_purchase_batches to use correct transaction_type
-- 'purchase' instead of 'in'
-- ============================================================================

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
  _ledger_id uuid;
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
    _ledger_id := (_batch->>'ledger_id')::uuid;
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
          ledger_id = COALESCE(_ledger_id, ledger_id),
          updated_at = now()
      WHERE id = _existing_batch_id;
      _target_batch_id := _existing_batch_id;

      _results := _results || jsonb_build_object(
        'batch_id', _existing_batch_id, 'action', 'merged',
        'product_id', _product_id, 'quantity', _quantity
      );
    ELSE
      INSERT INTO public.inventory_batches (
        product_id, batch_number, quantity,
        purchase_price, mrp, expiry_date, manufacturing_date,
        supplier_id, ledger_id, company_id, received_date
      ) VALUES (
        _product_id, _effective_batch_number, _quantity,
        _purchase_price, _mrp, _expiry_date, _manufacturing_date,
        _supplier_id, _ledger_id, _company_id, now()
      )
      RETURNING id INTO _new_batch_id;
      _target_batch_id := _new_batch_id;

      _results := _results || jsonb_build_object(
        'batch_id', _new_batch_id, 'action', 'created',
        'product_id', _product_id, 'quantity', _quantity
      );
    END IF;

    -- Use correct transaction_type: 'purchase'
    INSERT INTO public.inventory_transactions (
      company_id, product_id, batch_id, transaction_type, quantity, rate,
      reference_type, reference_id, notes, created_by
    ) VALUES (
      _company_id, _product_id, _target_batch_id, 'purchase', _quantity, _purchase_price,
      'purchase_order', _purchase_order_id, 'Received ' || _quantity || ' from purchase', _caller
    );
  END LOOP;

  RETURN _results;
END;
$function$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.receive_purchase_batches(jsonb, uuid) TO authenticated;
