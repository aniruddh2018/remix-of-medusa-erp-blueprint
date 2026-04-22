-- 1. Trigger to auto-log scheduled drug sales into scheduled_drug_register
CREATE OR REPLACE FUNCTION public.log_scheduled_drug_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _schedule public.drug_schedule;
  _balance integer;
  _sale RECORD;
BEGIN
  -- Get drug schedule for product
  SELECT drug_schedule INTO _schedule FROM public.products WHERE id = NEW.product_id;
  IF _schedule IS NULL OR _schedule = 'none' THEN
    RETURN NEW;
  END IF;

  -- Pull sale info (doctor, patient, prescription)
  SELECT customer_name, doctor_name, doctor_registration_number, prescription_number, sale_date, created_by, company_id
  INTO _sale
  FROM public.sales_orders WHERE id = NEW.sales_order_id;

  -- Current batch balance after sale
  SELECT quantity INTO _balance FROM public.inventory_batches WHERE id = NEW.batch_id;

  INSERT INTO public.scheduled_drug_register (
    company_id, product_id, batch_id, transaction_type, quantity, balance_quantity,
    patient_name, doctor_name, doctor_registration_number, prescription_number,
    transaction_date, recorded_by, notes
  ) VALUES (
    _sale.company_id, NEW.product_id, NEW.batch_id, 'sale',
    NEW.quantity + COALESCE(NEW.free_quantity, 0),
    COALESCE(_balance, 0),
    _sale.customer_name, _sale.doctor_name, _sale.doctor_registration_number, _sale.prescription_number,
    COALESCE(_sale.sale_date, CURRENT_DATE), COALESCE(_sale.created_by, auth.uid()),
    'Auto-logged from sale'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_scheduled_drug_sale ON public.sales_order_items;
CREATE TRIGGER trg_log_scheduled_drug_sale
  AFTER INSERT ON public.sales_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.log_scheduled_drug_sale();

-- 2. RPC: process supplier return - deducts batch stock + logs ledger entry
CREATE OR REPLACE FUNCTION public.process_supplier_return(
  _batch_id uuid,
  _quantity integer,
  _reason text,
  _debit_note_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
)
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
  _purchase_price numeric;
  _caller_company uuid;
  _caller uuid;
BEGIN
  _caller := auth.uid();
  _caller_company := public.get_user_company_id(_caller);
  IF _caller_company IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT quantity, company_id, product_id, purchase_price
  INTO _current_qty, _batch_company, _product_id, _purchase_price
  FROM public.inventory_batches WHERE id = _batch_id FOR UPDATE;

  IF _current_qty IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF _batch_company IS DISTINCT FROM _caller_company AND NOT public.is_super_admin(_caller) THEN
    RAISE EXCEPTION 'Unauthorized: batch belongs to another company';
  END IF;
  IF _quantity <= 0 OR _quantity > _current_qty THEN
    RAISE EXCEPTION 'Invalid return quantity. Available: %, Requested: %', _current_qty, _quantity;
  END IF;

  _new_qty := _current_qty - _quantity;
  UPDATE public.inventory_batches SET quantity = _new_qty, updated_at = now() WHERE id = _batch_id;

  INSERT INTO public.inventory_transactions
    (company_id, product_id, batch_id, transaction_type, quantity, rate, reference_type, reference_id, notes, created_by)
  VALUES
    (_caller_company, _product_id, _batch_id, 'supplier_return', -_quantity, COALESCE(_purchase_price, 0),
     'debit_note', _debit_note_id, COALESCE(_notes, _reason), _caller);

  RETURN jsonb_build_object(
    'batch_id', _batch_id,
    'returned', _quantity,
    'remaining', _new_qty,
    'value', _quantity * COALESCE(_purchase_price, 0)
  );
END;
$$;