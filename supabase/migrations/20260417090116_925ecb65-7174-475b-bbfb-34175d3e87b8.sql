
CREATE OR REPLACE FUNCTION public.enforce_sale_item_discount_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid;
  _company uuid;
  _max_admin numeric;
  _max_pharm numeric;
  _max_staff numeric;
  _allowed numeric;
BEGIN
  _caller := auth.uid();

  IF _caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin(_caller) THEN
    RETURN NEW;
  END IF;

  _company := COALESCE(NEW.company_id, public.get_user_company_id(_caller));
  IF _company IS NULL THEN
    RAISE EXCEPTION 'Cannot determine company for discount validation';
  END IF;

  SELECT max_discount_admin, max_discount_pharmacist, max_discount_staff
  INTO _max_admin, _max_pharm, _max_staff
  FROM public.invoice_settings
  WHERE company_id = _company;

  _max_admin := COALESCE(_max_admin, 100);
  _max_pharm := COALESCE(_max_pharm, 50);
  _max_staff := COALESCE(_max_staff, 15);

  IF public.has_role(_caller, 'admin'::app_role) THEN
    _allowed := _max_admin;
  ELSIF public.has_role(_caller, 'pharmacist'::app_role) THEN
    _allowed := _max_pharm;
  ELSE
    _allowed := _max_staff;
  END IF;

  IF COALESCE(NEW.discount_percentage, 0) > _allowed THEN
    RAISE EXCEPTION 'Discount % exceeds your allowed maximum of %', NEW.discount_percentage, _allowed;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_discount_cap_on_sale_items ON public.sales_order_items;
CREATE TRIGGER enforce_discount_cap_on_sale_items
BEFORE INSERT OR UPDATE ON public.sales_order_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_item_discount_cap();
