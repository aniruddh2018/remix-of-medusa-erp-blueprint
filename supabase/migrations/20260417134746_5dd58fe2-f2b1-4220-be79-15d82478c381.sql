CREATE OR REPLACE FUNCTION public.dispose_expired_batch(_batch_id uuid, _quantity integer, _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_qty integer;
  _new_qty integer;
  _batch_company uuid;
  _product_id uuid;
  _mrp numeric;
  _purchase_price numeric;
  _expiry_date date;
  _caller_company uuid;
  _caller uuid;
BEGIN
  _caller := auth.uid();
  _caller_company := public.get_user_company_id(_caller);
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT quantity, company_id, product_id, mrp, purchase_price, expiry_date
  INTO _current_qty, _batch_company, _product_id, _mrp, _purchase_price, _expiry_date
  FROM public.inventory_batches
  WHERE id = _batch_id
  FOR UPDATE;

  IF _current_qty IS NULL THEN
    RAISE EXCEPTION 'Batch not found: %', _batch_id;
  END IF;

  IF _batch_company IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(_caller) THEN
    RAISE EXCEPTION 'Unauthorized: batch belongs to another company';
  END IF;

  IF _quantity <= 0 OR _quantity > _current_qty THEN
    RAISE EXCEPTION 'Invalid disposal quantity. Available: %, Requested: %', _current_qty, _quantity;
  END IF;

  _new_qty := _current_qty - _quantity;

  UPDATE public.inventory_batches
  SET quantity = _new_qty, updated_at = now()
  WHERE id = _batch_id;

  -- Log to ledger as expiry_loss (negative quantity = outflow). Rate stores purchase price for loss valuation.
  INSERT INTO public.inventory_transactions
    (company_id, product_id, batch_id, transaction_type, quantity, rate, reference_type, reference_id, notes, created_by)
  VALUES
    (_caller_company, _product_id, _batch_id, 'expiry_loss', -_quantity, COALESCE(_purchase_price, 0), 'expiry_disposal', _batch_id,
     COALESCE(_notes, 'Expired batch disposal'), _caller);

  RETURN jsonb_build_object(
    'batch_id', _batch_id,
    'disposed', _quantity,
    'remaining', _new_qty,
    'loss_value', _quantity * COALESCE(_purchase_price, 0),
    'mrp_value', _quantity * COALESCE(_mrp, 0)
  );
END;
$$;