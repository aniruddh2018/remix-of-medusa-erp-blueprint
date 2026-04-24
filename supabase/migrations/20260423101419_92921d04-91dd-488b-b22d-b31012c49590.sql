-- Replace deduct_sale_inventory to handle loose + sealed (multi-unit ledger)
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
  _qty integer;
  _free_qty integer;
  _base_qty integer;
  _total_deduct integer;
  _sealed integer;
  _loose integer;
  _pack integer;
  _need integer;
  _broken integer;
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
    _batch_id := (_item->>'batch_id')::uuid;
    _qty := COALESCE((_item->>'quantity')::integer, 0);
    _free_qty := COALESCE((_item->>'free_quantity')::integer, 0);
    -- base_quantity is the already-converted base-unit total (paid + free).
    -- If the caller didn't compute it, fall back to qty + free_qty (single-unit behavior).
    _base_qty := COALESCE((_item->>'base_quantity')::integer, _qty + _free_qty);
    _total_deduct := _qty + _free_qty;
    _reference_id := (_item->>'reference_id')::uuid;
    _unit_price := COALESCE((_item->>'unit_price')::numeric, 0);

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

    -- Expiry enforcement
    SELECT expiry_required INTO _product_expiry_required FROM public.products WHERE id = _product_id;
    _enforce_expiry := _block_expired OR COALESCE(_product_expiry_required, false);

    IF _enforce_expiry AND _batch_expiry IS NOT NULL AND _batch_expiry <= CURRENT_DATE THEN
      RAISE EXCEPTION 'Cannot sell from expired batch (expired %)', _batch_expiry;
    END IF;

    -- Total available in base units
    IF (_loose + _sealed * COALESCE(_pack, 1)) < _base_qty THEN
      RAISE EXCEPTION 'Insufficient stock in batch %. Available: % base units, Requested: %',
        _batch_id, _loose + _sealed * COALESCE(_pack, 1), _base_qty;
    END IF;

    _need := _base_qty;
    _broken := 0;

    -- Take from loose first
    IF _loose >= _need THEN
      _loose := _loose - _need;
      _need := 0;
    ELSE
      _need := _need - _loose;
      _loose := 0;
    END IF;

    -- Break open sealed packs as needed
    IF _need > 0 THEN
      IF COALESCE(_pack, 0) <= 0 THEN
        -- No pack defined: treat sealed as base units 1:1
        _sealed := _sealed - _need;
        _need := 0;
      ELSE
        _broken := CEIL(_need::numeric / _pack)::integer;
        _sealed := _sealed - _broken;
        _loose := (_broken * _pack) - _need;
        _need := 0;
      END IF;
    END IF;

    UPDATE public.inventory_batches
    SET quantity = _sealed, loose_quantity = _loose, updated_at = now()
    WHERE id = _batch_id;

    -- Log to ledger (negative quantity = outflow). Use total billed units (qty+free) for legacy reports.
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

-- Also enhance restore_sale_inventory to put units back as loose by default (safer for cut-strip returns).
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
  _total_restore integer;
  _base_restore integer;
  _pack integer;
  _batch_company uuid;
  _caller_company uuid;
  _caller uuid;
  _reference_id uuid;
  _add_sealed integer := 0;
  _add_loose integer := 0;
BEGIN
  _caller := auth.uid();
  _caller_company := public.get_user_company_id(_caller);
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _batch_id := (_item->>'batch_id')::uuid;
    _total_restore := COALESCE((_item->>'quantity')::integer, 0)
                    + COALESCE((_item->>'free_quantity')::integer, 0);
    _base_restore := COALESCE((_item->>'base_quantity')::integer, _total_restore);
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

    -- Reform sealed packs from full multiples; remainder goes to loose.
    IF COALESCE(_pack, 0) > 0 THEN
      _add_sealed := _base_restore / _pack;
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