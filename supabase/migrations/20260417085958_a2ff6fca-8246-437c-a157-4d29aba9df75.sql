
-- =====================================================
-- 1. STORAGE: invoices bucket — company-scoped policies
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can read invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;

CREATE POLICY "Company members read own invoice files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'invoices'
  AND (storage.foldername(name))[1] = (public.get_user_company_id(auth.uid()))::text
);

CREATE POLICY "Company members upload own invoice files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'invoices'
  AND (storage.foldername(name))[1] = (public.get_user_company_id(auth.uid()))::text
);

CREATE POLICY "Company members update own invoice files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'invoices'
  AND (storage.foldername(name))[1] = (public.get_user_company_id(auth.uid()))::text
)
WITH CHECK (
  bucket_id = 'invoices'
  AND (storage.foldername(name))[1] = (public.get_user_company_id(auth.uid()))::text
);

CREATE POLICY "Company members delete own invoice files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'invoices'
  AND (storage.foldername(name))[1] = (public.get_user_company_id(auth.uid()))::text
);

-- =====================================================
-- 2. USER_ROLES: block self-privilege escalation
-- =====================================================
-- Explicit restrictive policy: only admins/super_admins may insert roles
CREATE POLICY "Only admins can grant roles"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Only admins can update roles"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Only admins can delete roles"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
);

-- =====================================================
-- 3. RPC FUNCTIONS: tenant ownership verification
-- =====================================================

-- Helper-style inline checks via auth.uid()
CREATE OR REPLACE FUNCTION public.deduct_batch_quantity(_batch_id uuid, _quantity integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _current_qty integer;
  _new_qty integer;
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

CREATE OR REPLACE FUNCTION public.deduct_sale_inventory(_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item jsonb;
  _batch_id uuid;
  _total_deduct integer;
  _current_qty integer;
  _new_qty integer;
  _batch_company uuid;
  _caller_company uuid;
  _results jsonb := '[]'::jsonb;
BEGIN
  _caller_company := public.get_user_company_id(auth.uid());
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _batch_id := (_item->>'batch_id')::uuid;
    _total_deduct := COALESCE((_item->>'quantity')::integer, 0)
                   + COALESCE((_item->>'free_quantity')::integer, 0);

    IF _total_deduct <= 0 THEN
      CONTINUE;
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
$function$;

CREATE OR REPLACE FUNCTION public.restore_sale_inventory(_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item jsonb;
  _batch_id uuid;
  _total_restore integer;
  _batch_company uuid;
  _caller_company uuid;
BEGIN
  _caller_company := public.get_user_company_id(auth.uid());
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _batch_id := (_item->>'batch_id')::uuid;
    _total_restore := COALESCE((_item->>'quantity')::integer, 0)
                    + COALESCE((_item->>'free_quantity')::integer, 0);

    IF _total_restore <= 0 THEN
      CONTINUE;
    END IF;

    SELECT company_id INTO _batch_company
    FROM public.inventory_batches
    WHERE id = _batch_id
    FOR UPDATE;

    IF _batch_company IS NULL THEN
      RAISE EXCEPTION 'Batch not found: %', _batch_id;
    END IF;

    IF _batch_company IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Unauthorized: batch belongs to another company';
    END IF;

    UPDATE public.inventory_batches
    SET quantity = quantity + _total_restore, updated_at = now()
    WHERE id = _batch_id;
  END LOOP;
END;
$function$;

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
  _quantity integer;
  _purchase_price numeric;
  _mrp numeric;
  _expiry_date date;
  _manufacturing_date date;
  _supplier_id uuid;
  _company_id uuid;
  _caller_company uuid;
  _existing_batch_id uuid;
  _new_batch_id uuid;
  _results jsonb := '[]'::jsonb;
  _is_user_provided boolean;
  _effective_batch_number text;
BEGIN
  _caller_company := public.get_user_company_id(auth.uid());
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Verify purchase order ownership when provided
  IF _purchase_order_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE id = _purchase_order_id
        AND (company_id = _caller_company OR public.is_super_admin(auth.uid()))
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

    IF _quantity <= 0 THEN
      CONTINUE;
    END IF;

    -- Enforce caller's company; ignore client-supplied value unless super admin
    IF _company_id IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(auth.uid()) THEN
      _company_id := _caller_company;
    END IF;

    -- Verify product belongs to the same company
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = _product_id
        AND (company_id = _caller_company OR public.is_super_admin(auth.uid()))
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

      _results := _results || jsonb_build_object(
        'batch_id', _existing_batch_id,
        'action', 'merged',
        'batch_number', _effective_batch_number,
        'quantity_added', _quantity
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

      _results := _results || jsonb_build_object(
        'batch_id', _new_batch_id,
        'action', 'created',
        'batch_number', _effective_batch_number,
        'quantity_added', _quantity
      );
    END IF;
  END LOOP;

  IF _purchase_order_id IS NOT NULL THEN
    UPDATE public.purchase_orders
    SET status = 'delivered', updated_at = now()
    WHERE id = _purchase_order_id;
  END IF;

  RETURN _results;
END;
$function$;

CREATE OR REPLACE FUNCTION public.allocate_batches_fifo(_product_id uuid, _requested_quantity integer, _company_id uuid, _exclude_batch_quantities jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _batch record;
  _remaining integer := _requested_quantity;
  _available integer;
  _allocate integer;
  _cart_qty integer;
  _allocations jsonb := '[]'::jsonb;
  _total_available integer := 0;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_next_invoice_number(_company_id uuid, _prefix text DEFAULT 'INV'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _year integer;
  _next integer;
  _caller_company uuid;
BEGIN
  _caller_company := public.get_user_company_id(auth.uid());
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF _company_id IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: cannot generate invoice numbers for another company';
  END IF;

  _year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;

  INSERT INTO public.invoice_sequences (company_id, prefix, year, last_number)
  VALUES (_company_id, _prefix, _year, 1)
  ON CONFLICT (company_id, prefix, year)
  DO UPDATE SET last_number = invoice_sequences.last_number + 1, updated_at = now()
  RETURNING last_number INTO _next;

  RETURN _prefix || '-' || _year || '-' || LPAD(_next::text, 4, '0');
END;
$function$;
