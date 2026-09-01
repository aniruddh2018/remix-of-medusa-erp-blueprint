
-- financial_years + its fy_status enum were never captured by any migration
-- (created out-of-band before this point in the project's history) — every
-- later migration and edge function (close-financial-year, fy-backfill)
-- assumes both already exist. Recreated here, at the earliest point they're
-- referenced, from how those callers use the table.
DO $$ BEGIN
  CREATE TYPE public.fy_status AS ENUM ('active', 'closed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.financial_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status public.fy_status NOT NULL DEFAULT 'active',
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_years TO authenticated;
GRANT ALL ON public.financial_years TO service_role;
ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_years_company_access ON public.financial_years;
CREATE POLICY financial_years_company_access ON public.financial_years FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

DO $$ BEGIN
  ALTER TABLE public.financial_years ADD CONSTRAINT financial_years_company_start_uk UNIQUE (company_id, start_date);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS financial_years_one_active_per_company
  ON public.financial_years(company_id) WHERE status = 'active';

ALTER TABLE public.sales_orders           ADD COLUMN IF NOT EXISTS financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders        ADD COLUMN IF NOT EXISTS financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE SET NULL;
ALTER TABLE public.payments               ADD COLUMN IF NOT EXISTS financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE SET NULL;
ALTER TABLE public.credit_notes           ADD COLUMN IF NOT EXISTS financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE SET NULL;
ALTER TABLE public.debit_notes            ADD COLUMN IF NOT EXISTS financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE SET NULL;
ALTER TABLE public.journal_vouchers       ADD COLUMN IF NOT EXISTS financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE SET NULL;
ALTER TABLE public.prescriptions          ADD COLUMN IF NOT EXISTS financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_batches      ADD COLUMN IF NOT EXISTS financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_batches      ADD COLUMN IF NOT EXISTS is_carry_forward boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoice_sequences      ADD COLUMN IF NOT EXISTS financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sales_orders_fy           ON public.sales_orders(financial_year_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_fy        ON public.purchase_orders(financial_year_id);
CREATE INDEX IF NOT EXISTS idx_payments_fy               ON public.payments(financial_year_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_fy           ON public.credit_notes(financial_year_id);
CREATE INDEX IF NOT EXISTS idx_debit_notes_fy            ON public.debit_notes(financial_year_id);
CREATE INDEX IF NOT EXISTS idx_journal_vouchers_fy       ON public.journal_vouchers(financial_year_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_fy ON public.inventory_transactions(financial_year_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_fy          ON public.prescriptions(financial_year_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_fy      ON public.inventory_batches(financial_year_id);

DO $$ BEGIN
  ALTER TABLE public.ledger_balances
    ADD CONSTRAINT ledger_balances_company_ledger_fy_uk UNIQUE (company_id, ledger_id, financial_year);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.can_manage_financial_year(_user uuid, _company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user) OR EXISTS (
    SELECT 1 FROM public.user_companies uc
    WHERE uc.user_id = _user AND uc.company_id = _company
      AND uc.role IN ('admin'::app_role, 'super_admin'::app_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.create_previous_financial_year(
  p_company_id uuid, p_name text, p_start_date date, p_end_date date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fy_id uuid;
  v_sales int:=0; v_purch int:=0; v_pay int:=0; v_cn int:=0;
  v_dn int:=0; v_jv int:=0; v_itx int:=0; v_rx int:=0;
BEGIN
  IF NOT public.can_manage_financial_year(auth.uid(), p_company_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_start_date >= p_end_date THEN RAISE EXCEPTION 'start_date must be before end_date'; END IF;

  INSERT INTO public.financial_years (company_id, name, start_date, end_date, status)
  VALUES (p_company_id, p_name, p_start_date, p_end_date, 'archived')
  RETURNING id INTO v_fy_id;

  UPDATE public.sales_orders SET financial_year_id=v_fy_id
    WHERE company_id=p_company_id AND financial_year_id IS NULL
      AND sale_date BETWEEN p_start_date AND p_end_date;
  GET DIAGNOSTICS v_sales=ROW_COUNT;

  UPDATE public.purchase_orders SET financial_year_id=v_fy_id
    WHERE company_id=p_company_id AND financial_year_id IS NULL
      AND order_date BETWEEN p_start_date AND p_end_date;
  GET DIAGNOSTICS v_purch=ROW_COUNT;

  UPDATE public.payments SET financial_year_id=v_fy_id
    WHERE company_id=p_company_id AND financial_year_id IS NULL
      AND payment_date BETWEEN p_start_date AND p_end_date;
  GET DIAGNOSTICS v_pay=ROW_COUNT;

  UPDATE public.credit_notes SET financial_year_id=v_fy_id
    WHERE company_id=p_company_id AND financial_year_id IS NULL
      AND created_at::date BETWEEN p_start_date AND p_end_date;
  GET DIAGNOSTICS v_cn=ROW_COUNT;

  UPDATE public.debit_notes SET financial_year_id=v_fy_id
    WHERE company_id=p_company_id AND financial_year_id IS NULL
      AND created_at::date BETWEEN p_start_date AND p_end_date;
  GET DIAGNOSTICS v_dn=ROW_COUNT;

  UPDATE public.journal_vouchers SET financial_year_id=v_fy_id
    WHERE company_id=p_company_id AND financial_year_id IS NULL
      AND date BETWEEN p_start_date AND p_end_date;
  GET DIAGNOSTICS v_jv=ROW_COUNT;

  UPDATE public.inventory_transactions SET financial_year_id=v_fy_id
    WHERE company_id=p_company_id AND financial_year_id IS NULL
      AND created_at::date BETWEEN p_start_date AND p_end_date;
  GET DIAGNOSTICS v_itx=ROW_COUNT;

  UPDATE public.prescriptions SET financial_year_id=v_fy_id
    WHERE company_id=p_company_id AND financial_year_id IS NULL
      AND created_at::date BETWEEN p_start_date AND p_end_date;
  GET DIAGNOSTICS v_rx=ROW_COUNT;

  RETURN jsonb_build_object(
    'financial_year_id', v_fy_id, 'name', p_name,
    'sales_orders_tagged', v_sales, 'purchase_orders_tagged', v_purch,
    'payments_tagged', v_pay, 'credit_notes_tagged', v_cn,
    'debit_notes_tagged', v_dn, 'journal_vouchers_tagged', v_jv,
    'inventory_transactions_tagged', v_itx, 'prescriptions_tagged', v_rx
  );
END $$;

CREATE OR REPLACE FUNCTION public.close_and_open_financial_year(
  p_company_id uuid, p_new_name text, p_new_start date, p_new_end date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cur_id uuid; v_cur_name text; v_new_id uuid;
  v_ledgers int:=0; v_batches int:=0;
BEGIN
  IF NOT public.can_manage_financial_year(auth.uid(), p_company_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id, name INTO v_cur_id, v_cur_name
    FROM public.financial_years
    WHERE company_id=p_company_id AND status='active' LIMIT 1;

  IF v_cur_id IS NOT NULL THEN
    UPDATE public.financial_years
      SET status='closed', closed_at=now(), closed_by=auth.uid()
      WHERE id=v_cur_id;
  END IF;

  INSERT INTO public.financial_years (company_id, name, start_date, end_date, status)
  VALUES (p_company_id, p_new_name, p_new_start, p_new_end, 'active')
  RETURNING id INTO v_new_id;

  IF v_cur_name IS NOT NULL THEN
    INSERT INTO public.ledger_balances (
      company_id, ledger_id, financial_year,
      opening_balance, opening_balance_type,
      current_balance, total_debit, total_credit,
      closing_balance, closing_balance_type
    )
    SELECT lb.company_id, lb.ledger_id, p_new_name,
      lb.closing_balance, lb.closing_balance_type,
      lb.closing_balance, 0, 0,
      lb.closing_balance, lb.closing_balance_type
    FROM public.ledger_balances lb
    WHERE lb.company_id=p_company_id AND lb.financial_year=v_cur_name
    ON CONFLICT (company_id, ledger_id, financial_year) DO NOTHING;
    GET DIAGNOSTICS v_ledgers=ROW_COUNT;
  END IF;

  INSERT INTO public.inventory_batches (
    company_id, product_id, batch_number, quantity, loose_quantity,
    expiry_date, manufacturing_date, purchase_price, mrp,
    supplier_id, received_date, pack_size,
    financial_year_id, is_carry_forward
  )
  SELECT b.company_id, b.product_id,
    b.batch_number || '-CF' || to_char(p_new_start,'YY'),
    b.quantity, COALESCE(b.loose_quantity,0),
    b.expiry_date, b.manufacturing_date, b.purchase_price, b.mrp,
    b.supplier_id, p_new_start, b.pack_size,
    v_new_id, true
  FROM public.inventory_batches b
  WHERE b.company_id=p_company_id
    AND COALESCE(b.deleted,false)=false
    AND (COALESCE(b.quantity,0)+COALESCE(b.loose_quantity,0)) > 0
    AND COALESCE(b.is_carry_forward,false)=false;
  GET DIAGNOSTICS v_batches=ROW_COUNT;

  UPDATE public.inventory_batches
    SET financial_year_id = COALESCE(financial_year_id, v_cur_id),
        quantity=0, loose_quantity=0
    WHERE company_id=p_company_id
      AND COALESCE(is_carry_forward,false)=false
      AND (COALESCE(quantity,0)+COALESCE(loose_quantity,0)) > 0
      AND financial_year_id IS DISTINCT FROM v_new_id;

  INSERT INTO public.invoice_sequences (company_id, prefix, year, last_number, format, padding, financial_year_id)
  SELECT DISTINCT company_id, prefix, EXTRACT(YEAR FROM p_new_start)::int, 0, format, padding, v_new_id
    FROM public.invoice_sequences
   WHERE company_id=p_company_id
     AND (financial_year_id=v_cur_id OR financial_year_id IS NULL)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'closed_financial_year_id', v_cur_id,
    'new_financial_year_id', v_new_id,
    'new_financial_year_name', p_new_name,
    'ledger_balances_carried', v_ledgers,
    'batches_carried', v_batches
  );
END $$;

GRANT EXECUTE ON FUNCTION public.can_manage_financial_year(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_previous_financial_year(uuid, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_and_open_financial_year(uuid, text, date, date) TO authenticated;
