
-- 1. Create inventory_transactions ledger table
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  product_id uuid NOT NULL,
  batch_id uuid,
  transaction_type text NOT NULL CHECK (transaction_type IN ('purchase','sale','sale_return','purchase_return','adjustment','opening')),
  quantity integer NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_company_product ON public.inventory_transactions(company_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_tx_batch ON public.inventory_transactions(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_tx_reference ON public.inventory_transactions(reference_type, reference_id);

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own company inventory transactions"
ON public.inventory_transactions FOR SELECT
USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Insert own company inventory transactions"
ON public.inventory_transactions FOR INSERT
WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- 2. Update deduct_sale_inventory to enforce expiry + log ledger entries
CREATE OR REPLACE FUNCTION public.deduct_sale_inventory(_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _item jsonb;
  _batch_id uuid;
  _product_id uuid;
  _total_deduct integer;
  _qty integer;
  _free_qty integer;
  _current_qty integer;
  _new_qty integer;
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
    _total_deduct := _qty + _free_qty;
    _reference_id := (_item->>'reference_id')::uuid;
    _unit_price := COALESCE((_item->>'unit_price')::numeric, 0);

    IF _total_deduct <= 0 THEN
      CONTINUE;
    END IF;

    SELECT b.quantity, b.company_id, b.expiry_date, b.product_id
    INTO _current_qty, _batch_company, _batch_expiry, _product_id
    FROM public.inventory_batches b
    WHERE b.id = _batch_id
    FOR UPDATE;

    IF _current_qty IS NULL THEN
      RAISE EXCEPTION 'Batch not found: %', _batch_id;
    END IF;

    IF _batch_company IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(_caller) THEN
      RAISE EXCEPTION 'Unauthorized: batch belongs to another company';
    END IF;

    -- Expiry enforcement: company default OR per-product override
    SELECT expiry_required INTO _product_expiry_required FROM public.products WHERE id = _product_id;
    _enforce_expiry := _block_expired OR COALESCE(_product_expiry_required, false);

    IF _enforce_expiry AND _batch_expiry IS NOT NULL AND _batch_expiry <= CURRENT_DATE THEN
      RAISE EXCEPTION 'Cannot sell from expired batch (expired %)', _batch_expiry;
    END IF;

    IF _current_qty < _total_deduct THEN
      RAISE EXCEPTION 'Insufficient stock in batch %. Available: %, Requested: %',
        _batch_id, _current_qty, _total_deduct;
    END IF;

    _new_qty := _current_qty - _total_deduct;

    UPDATE public.inventory_batches
    SET quantity = _new_qty, updated_at = now()
    WHERE id = _batch_id;

    -- Log to ledger (negative quantity = outflow)
    INSERT INTO public.inventory_transactions
      (company_id, product_id, batch_id, transaction_type, quantity, rate, reference_type, reference_id, created_by)
    VALUES
      (_caller_company, _product_id, _batch_id, 'sale', -_total_deduct, _unit_price, 'sales_order', _reference_id, _caller);

    _results := _results || jsonb_build_object(
      'batch_id', _batch_id,
      'deducted', _total_deduct,
      'remaining', _new_qty
    );
  END LOOP;

  RETURN _results;
END;
$function$;

-- 3. Update restore_sale_inventory to log positive entries
CREATE OR REPLACE FUNCTION public.restore_sale_inventory(_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _item jsonb;
  _batch_id uuid;
  _product_id uuid;
  _total_restore integer;
  _batch_company uuid;
  _caller_company uuid;
  _caller uuid;
  _reference_id uuid;
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
    _reference_id := (_item->>'reference_id')::uuid;

    IF _total_restore <= 0 THEN CONTINUE; END IF;

    SELECT company_id, product_id INTO _batch_company, _product_id
    FROM public.inventory_batches
    WHERE id = _batch_id
    FOR UPDATE;

    IF _batch_company IS NULL THEN
      RAISE EXCEPTION 'Batch not found: %', _batch_id;
    END IF;

    IF _batch_company IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(_caller) THEN
      RAISE EXCEPTION 'Unauthorized: batch belongs to another company';
    END IF;

    UPDATE public.inventory_batches
    SET quantity = quantity + _total_restore, updated_at = now()
    WHERE id = _batch_id;

    INSERT INTO public.inventory_transactions
      (company_id, product_id, batch_id, transaction_type, quantity, reference_type, reference_id, created_by)
    VALUES
      (_caller_company, _product_id, _batch_id, 'sale_return', _total_restore, 'sales_order', _reference_id, _caller);
  END LOOP;
END;
$function$;

-- 4. Update receive_purchase_batches to log positive entries
CREATE OR REPLACE FUNCTION public.receive_purchase_batches(_batches jsonb, _purchase_order_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
    _quantity := COALESCE((_batch->>'quantity')::integer, 0);
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

    -- Log to ledger
    INSERT INTO public.inventory_transactions
      (company_id, product_id, batch_id, transaction_type, quantity, rate, reference_type, reference_id, created_by)
    VALUES
      (_company_id, _product_id, _target_batch_id, 'purchase', _quantity, _purchase_price, 'purchase_order', _purchase_order_id, _caller);
  END LOOP;

  IF _purchase_order_id IS NOT NULL THEN
    UPDATE public.purchase_orders
    SET status = 'delivered', updated_at = now()
    WHERE id = _purchase_order_id;
  END IF;

  RETURN _results;
END;
$function$;
