
CREATE OR REPLACE FUNCTION public.deduct_batch_quantity(
  _batch_id uuid,
  _quantity integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _current_qty integer;
  _new_qty integer;
BEGIN
  -- Lock the row to prevent concurrent modifications
  SELECT quantity INTO _current_qty
  FROM public.inventory_batches
  WHERE id = _batch_id
  FOR UPDATE;

  IF _current_qty IS NULL THEN
    RAISE EXCEPTION 'Batch not found: %', _batch_id;
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
$$;
