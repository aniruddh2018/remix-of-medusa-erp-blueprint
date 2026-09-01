-- ============================================================
-- supabase/migrations/20260529190000_add_ledger_advanced_features.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ledger_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ledger_id UUID REFERENCES public.ledgers(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create','update','delete','merge','role_add','role_remove','balance_close','import')),
  old_values JSONB DEFAULT '{}',
  new_values JSONB DEFAULT '{}',
  changed_fields TEXT[] DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_audit_log TO authenticated;
GRANT ALL ON public.ledger_audit_log TO service_role;

CREATE INDEX IF NOT EXISTS idx_ledger_audit_log_company ON public.ledger_audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_ledger_audit_log_ledger ON public.ledger_audit_log(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_audit_log_action ON public.ledger_audit_log(company_id, action);
CREATE INDEX IF NOT EXISTS idx_ledger_audit_log_created ON public.ledger_audit_log(company_id, created_at DESC);

ALTER TABLE public.ledger_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_audit_log_view ON public.ledger_audit_log;
CREATE POLICY ledger_audit_log_view ON public.ledger_audit_log
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS ledger_audit_log_manage ON public.ledger_audit_log;
CREATE POLICY ledger_audit_log_manage ON public.ledger_audit_log
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_ledger_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_changed TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    INSERT INTO public.ledger_audit_log (company_id, ledger_id, action, new_values, description)
    VALUES (NEW.company_id, NEW.id, v_action, to_jsonb(NEW), 'Ledger created: ' || NEW.name);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    SELECT array_agg(diff.key) INTO v_changed
    FROM (
      SELECT r.key FROM jsonb_each(to_jsonb(NEW)) AS r(key, value)
      EXCEPT
      SELECT r.key FROM jsonb_each(to_jsonb(OLD)) AS r(key, value)
    ) diff;
    IF v_changed IS NOT NULL AND array_length(v_changed, 1) > 0 THEN
      INSERT INTO public.ledger_audit_log (company_id, ledger_id, action, old_values, new_values, changed_fields, description)
      VALUES (NEW.company_id, NEW.id, v_action, to_jsonb(OLD), to_jsonb(NEW), v_changed,
        'Updated ' || array_to_string(v_changed, ', ') || ' on ' || NEW.name);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    INSERT INTO public.ledger_audit_log (company_id, ledger_id, action, old_values, description)
    VALUES (OLD.company_id, OLD.id, v_action, to_jsonb(OLD), 'Ledger deleted: ' || OLD.name);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_audit ON public.ledgers;
CREATE TRIGGER trg_ledger_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.ledgers
  FOR EACH ROW EXECUTE FUNCTION public.log_ledger_audit();

CREATE OR REPLACE FUNCTION public.close_financial_year(
  p_company_id UUID,
  p_financial_year TEXT
)
RETURNS TABLE(ledger_id UUID, name TEXT, closing_balance NUMERIC, closing_balance_type TEXT)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.ledger_balances
  SET closing_balance = current_balance,
      closing_balance_type = CASE WHEN current_balance >= 0 THEN 'debit'::public.balance_type ELSE 'credit'::public.balance_type END
  WHERE company_id = p_company_id AND financial_year = p_financial_year;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.ledger_audit_log (company_id, action, description, new_values)
  VALUES (p_company_id, 'balance_close', 'Closed financial year ' || p_financial_year || ' (' || v_count || ' ledgers)',
    jsonb_build_object('financial_year', p_financial_year, 'ledgers_closed', v_count));

  RETURN QUERY
  SELECT lb.ledger_id, l.name, lb.closing_balance, lb.closing_balance_type::TEXT
  FROM public.ledger_balances lb
  JOIN public.ledgers l ON l.id = lb.ledger_id
  WHERE lb.company_id = p_company_id AND lb.financial_year = p_financial_year
  ORDER BY l.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.trial_balance(
  p_company_id UUID,
  p_financial_year TEXT
)
RETURNS TABLE(
  group_name TEXT,
  group_type TEXT,
  total_debit NUMERIC,
  total_credit NUMERIC
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(lg.name, 'Ungrouped') AS group_name,
    COALESCE(lg.group_type::text, 'other') AS group_type,
    SUM(CASE WHEN lb.closing_balance_type = 'debit' THEN lb.closing_balance ELSE 0 END) AS total_debit,
    SUM(CASE WHEN lb.closing_balance_type = 'credit' THEN lb.closing_balance ELSE 0 END) AS total_credit
  FROM public.ledger_balances lb
  JOIN public.ledgers l ON l.id = lb.ledger_id
  LEFT JOIN public.ledger_groups lg ON lg.id = l.ledger_group_id
  WHERE lb.company_id = p_company_id AND lb.financial_year = p_financial_year
  GROUP BY lg.name, lg.group_type
  ORDER BY lg.group_type, lg.name;
END;
$$;

-- ============================================================
-- Journal Vouchers + Auto-Post Triggers
-- ============================================================
DO $$ BEGIN
  CREATE TYPE journal_reference_type AS ENUM (
    'sales_order', 'purchase_order', 'payment', 'adjustment'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.journal_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_type journal_reference_type NOT NULL DEFAULT 'adjustment',
  reference_id UUID,
  reference_number TEXT,
  narration TEXT NOT NULL DEFAULT '',
  total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_vouchers TO authenticated;
GRANT ALL ON public.journal_vouchers TO service_role;

CREATE INDEX IF NOT EXISTS idx_journal_vouchers_company_date ON public.journal_vouchers(company_id, date);
CREATE INDEX IF NOT EXISTS idx_journal_vouchers_ref ON public.journal_vouchers(reference_type, reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_vouchers_created ON public.journal_vouchers(created_at DESC);

ALTER TABLE public.journal_vouchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_vouchers_view ON public.journal_vouchers;
CREATE POLICY journal_vouchers_view ON public.journal_vouchers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS journal_vouchers_manage ON public.journal_vouchers;
CREATE POLICY journal_vouchers_manage ON public.journal_vouchers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE TABLE IF NOT EXISTS public.journal_voucher_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES public.journal_vouchers(id) ON DELETE CASCADE,
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  debit_amount NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  narration TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_voucher_lines TO authenticated;
GRANT ALL ON public.journal_voucher_lines TO service_role;

CREATE INDEX IF NOT EXISTS idx_jvl_voucher ON public.journal_voucher_lines(voucher_id);
CREATE INDEX IF NOT EXISTS idx_jvl_ledger_date ON public.journal_voucher_lines(ledger_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jvl_company ON public.journal_voucher_lines(company_id);

ALTER TABLE public.journal_voucher_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jvl_view ON public.journal_voucher_lines;
CREATE POLICY jvl_view ON public.journal_voucher_lines
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS jvl_manage ON public.journal_voucher_lines;
CREATE POLICY jvl_manage ON public.journal_voucher_lines
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- Augment existing tables
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS skip_voucher_posting BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS ledger_id UUID REFERENCES public.ledgers(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS ledger_id UUID REFERENCES public.ledgers(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS ledger_id UUID REFERENCES public.ledgers(id) ON DELETE SET NULL;

-- Helper functions
CREATE OR REPLACE FUNCTION public.get_financial_year(p_date DATE)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM p_date);
  v_month INTEGER := EXTRACT(MONTH FROM p_date);
BEGIN
  IF v_month >= 4 THEN
    RETURN v_year::TEXT || '-' || (v_year + 1)::TEXT;
  ELSE
    RETURN (v_year - 1)::TEXT || '-' || v_year::TEXT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_system_ledger(
  p_company_id UUID,
  p_ledger_name TEXT,
  p_group_name TEXT,
  p_role_type TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_group_id UUID;
  v_ledger_id UUID;
BEGIN
  SELECT id INTO v_group_id
  FROM public.ledger_groups
  WHERE company_id = p_company_id AND name = p_group_name AND is_system = true
  LIMIT 1;

  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id
    FROM public.ledger_groups
    WHERE company_id = p_company_id AND name = p_group_name
    LIMIT 1;
  END IF;

  IF v_group_id IS NULL THEN
    INSERT INTO public.ledger_groups (company_id, name, group_type, is_system, sort_order)
    VALUES (p_company_id, p_group_name, 'other', true, 99)
    RETURNING id INTO v_group_id;
  END IF;

  SELECT id INTO v_ledger_id
  FROM public.ledgers
  WHERE company_id = p_company_id AND name = p_ledger_name
  LIMIT 1;

  IF v_ledger_id IS NULL THEN
    INSERT INTO public.ledgers (
      company_id, ledger_group_id, name, opening_balance, balance_type,
      is_active, source_system
    ) VALUES (
      p_company_id, v_group_id, p_ledger_name, 0, 'debit', true, 'imported'
    )
    RETURNING id INTO v_ledger_id;
  END IF;

  IF p_role_type IS NOT NULL AND p_role_type IN (
    'customer','supplier','manufacturer','distributor',
    'employee','doctor','bank','tax','expense','income','asset','liability'
  ) THEN
    INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
    VALUES (v_ledger_id, p_company_id, p_role_type::public.ledger_role_type, false)
    ON CONFLICT (ledger_id, role_type) DO NOTHING;
  END IF;

  RETURN v_ledger_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_party_ledger(
  p_company_id UUID,
  p_party_name TEXT,
  p_party_type TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ledger_id UUID;
  v_group_name TEXT;
  v_role TEXT;
  v_group_type TEXT;
  v_group_id UUID;
BEGIN
  IF p_party_name IS NULL OR trim(p_party_name) = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_ledger_id
  FROM public.ledgers
  WHERE company_id = p_company_id
    AND lower(name) = lower(trim(p_party_name))
  LIMIT 1;

  IF v_ledger_id IS NOT NULL THEN
    -- Ensure role exists for the requested usage
    IF p_party_type = 'supplier' THEN
      v_role := 'supplier';
    ELSE
      v_role := 'customer';
    END IF;
    INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
    VALUES (v_ledger_id, p_company_id, v_role::public.ledger_role_type, false)
    ON CONFLICT (ledger_id, role_type) DO NOTHING;
    RETURN v_ledger_id;
  END IF;

  IF p_party_type = 'supplier' THEN
    v_group_name := 'Sundry Creditors';
    v_role := 'supplier';
    v_group_type := 'sundry_creditors';
  ELSE
    v_group_name := 'Sundry Debtors';
    v_role := 'customer';
    v_group_type := 'sundry_debtors';
  END IF;

  SELECT id INTO v_group_id FROM public.ledger_groups
  WHERE company_id = p_company_id AND name = v_group_name AND is_system = true
  LIMIT 1;
  IF v_group_id IS NULL THEN
    INSERT INTO public.ledger_groups (company_id, name, group_type, is_system, sort_order)
    VALUES (p_company_id, v_group_name, v_group_type::public.ledger_group_type, true, 99)
    RETURNING id INTO v_group_id;
  END IF;

  INSERT INTO public.ledgers (
    company_id, ledger_group_id, name, opening_balance, balance_type, is_active, source_system
  ) VALUES (
    p_company_id, v_group_id, trim(p_party_name), 0, 'debit', true, 'imported'
  )
  RETURNING id INTO v_ledger_id;

  INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
  VALUES (v_ledger_id, p_company_id, v_role::public.ledger_role_type, true)
  ON CONFLICT (ledger_id, role_type) DO NOTHING;

  RETURN v_ledger_id;
END;
$$;

-- Auto-post triggers
CREATE OR REPLACE FUNCTION public.post_sale_voucher()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sales_account UUID;
  v_cash_ledger UUID;
  v_customer_ledger UUID;
  v_voucher_id UUID;
  v_is_cash BOOLEAN;
BEGIN
  v_is_cash := (NEW.payment_status = 'paid' AND COALESCE(NEW.amount_paid,0) >= COALESCE(NEW.total_amount,0))
    OR (NEW.payment_method IN ('cash','upi','card') AND (NEW.payment_status IS NULL OR NEW.payment_status = 'paid'));

  v_sales_account := public.get_or_create_system_ledger(NEW.company_id, 'Sales Account', 'Income', 'income');

  IF v_is_cash THEN
    v_cash_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Cash', 'Cash-in-Hand', 'cash');
  ELSE
    v_customer_ledger := public.resolve_party_ledger(NEW.company_id, NEW.customer_name, 'customer');
  END IF;

  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    NEW.company_id, COALESCE(NEW.sale_date, CURRENT_DATE), 'sales_order', NEW.id,
    COALESCE(NEW.invoice_number, 'Sale-' || NEW.id::TEXT),
    CASE WHEN v_is_cash THEN 'Cash sale' ELSE 'Credit sale - ' || COALESCE(NEW.customer_name, 'Unknown') END,
    NEW.total_amount, NEW.created_by
  )
  RETURNING id INTO v_voucher_id;

  IF v_is_cash THEN
    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, NEW.total_amount, 0, 'Cash / UPI / Card received');
  ELSE
    IF v_customer_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_customer_ledger, NEW.company_id, NEW.total_amount, 0, 'Receivable from ' || COALESCE(NEW.customer_name, 'customer'));
    END IF;
  END IF;

  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, v_sales_account, NEW.company_id, 0, NEW.total_amount, 'Sales income');

  IF NOT v_is_cash AND v_customer_ledger IS NOT NULL THEN
    UPDATE public.sales_orders SET ledger_id = v_customer_ledger WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_sale_voucher ON public.sales_orders;
CREATE TRIGGER trg_post_sale_voucher
  AFTER INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.post_sale_voucher();

CREATE OR REPLACE FUNCTION public.post_purchase_voucher()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_purchase_account UUID;
  v_supplier_ledger UUID;
  v_voucher_id UUID;
  v_supplier_name TEXT;
BEGIN
  SELECT name INTO v_supplier_name
  FROM public.suppliers
  WHERE id = NEW.supplier_id AND company_id = NEW.company_id;

  IF v_supplier_name IS NULL THEN
    v_supplier_name := 'Supplier ' || NEW.supplier_id::TEXT;
  END IF;

  v_purchase_account := public.get_or_create_system_ledger(NEW.company_id, 'Purchase Account', 'Expenses', 'expense');
  v_supplier_ledger := public.resolve_party_ledger(NEW.company_id, v_supplier_name, 'supplier');

  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    NEW.company_id, COALESCE(NEW.order_date, CURRENT_DATE), 'purchase_order', NEW.id,
    COALESCE(NEW.invoice_number, NEW.order_number, 'PO-' || NEW.id::TEXT),
    'Purchase from ' || v_supplier_name,
    NEW.total_amount, NEW.created_by
  )
  RETURNING id INTO v_voucher_id;

  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, v_purchase_account, NEW.company_id, NEW.total_amount, 0, 'Purchase expense');

  IF v_supplier_ledger IS NOT NULL THEN
    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_supplier_ledger, NEW.company_id, 0, NEW.total_amount, 'Payable to ' || v_supplier_name);
    UPDATE public.purchase_orders SET ledger_id = v_supplier_ledger WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_purchase_voucher ON public.purchase_orders;
CREATE TRIGGER trg_post_purchase_voucher
  AFTER INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.post_purchase_voucher();

CREATE OR REPLACE FUNCTION public.post_payment_voucher()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cash_ledger UUID;
  v_bank_ledger UUID;
  v_party_ledger UUID;
  v_voucher_id UUID;
  v_method TEXT;
BEGIN
  IF NEW.skip_voucher_posting = true THEN
    RETURN NEW;
  END IF;

  v_method := COALESCE(NEW.payment_method, 'cash');

  IF v_method IN ('bank_transfer', 'cheque') THEN
    v_bank_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Bank Account', 'Bank Accounts', 'bank');
  ELSE
    v_cash_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Cash', 'Cash-in-Hand', 'cash');
  END IF;

  IF NEW.party_type = 'supplier' THEN
    v_party_ledger := public.resolve_party_ledger(NEW.company_id, NEW.party_name, 'supplier');
  ELSE
    v_party_ledger := public.resolve_party_ledger(NEW.company_id, NEW.party_name, 'customer');
  END IF;

  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    NEW.company_id, COALESCE(NEW.payment_date, CURRENT_DATE), 'payment', NEW.id,
    COALESCE(NEW.reference_number, 'PAY-' || NEW.id::TEXT),
    CASE WHEN NEW.payment_type = 'received' THEN 'Payment received from ' || COALESCE(NEW.party_name, '') ELSE 'Payment made to ' || COALESCE(NEW.party_name, '') END,
    NEW.amount, NEW.created_by
  )
  RETURNING id INTO v_voucher_id;

  IF NEW.payment_type = 'received' THEN
    IF v_bank_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_bank_ledger, NEW.company_id, NEW.amount, 0, 'Received via ' || v_method);
    ELSE
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, NEW.amount, 0, 'Received via ' || v_method);
    END IF;
    IF v_party_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_party_ledger, NEW.company_id, 0, NEW.amount, 'Customer receipt');
    END IF;
  ELSE
    IF v_party_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_party_ledger, NEW.company_id, NEW.amount, 0, 'Supplier payment');
    END IF;
    IF v_bank_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_bank_ledger, NEW.company_id, 0, NEW.amount, 'Paid via ' || v_method);
    ELSE
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, 0, NEW.amount, 'Paid via ' || v_method);
    END IF;
  END IF;

  IF v_party_ledger IS NOT NULL THEN
    UPDATE public.payments SET ledger_id = v_party_ledger WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_payment_voucher ON public.payments;
CREATE TRIGGER trg_post_payment_voucher
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.post_payment_voucher();

CREATE OR REPLACE FUNCTION public.delete_cascade_voucher()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'sales_orders' THEN
    DELETE FROM public.journal_vouchers
    WHERE reference_type = 'sales_order' AND reference_id = OLD.id AND company_id = OLD.company_id;
  ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
    DELETE FROM public.journal_vouchers
    WHERE reference_type = 'purchase_order' AND reference_id = OLD.id AND company_id = OLD.company_id;
  ELSIF TG_TABLE_NAME = 'payments' THEN
    DELETE FROM public.journal_vouchers
    WHERE reference_type = 'payment' AND reference_id = OLD.id AND company_id = OLD.company_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_sale_voucher ON public.sales_orders;
CREATE TRIGGER trg_delete_sale_voucher
  AFTER DELETE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.delete_cascade_voucher();

DROP TRIGGER IF EXISTS trg_delete_purchase_voucher ON public.purchase_orders;
CREATE TRIGGER trg_delete_purchase_voucher
  AFTER DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.delete_cascade_voucher();

DROP TRIGGER IF EXISTS trg_delete_payment_voucher ON public.payments;
CREATE TRIGGER trg_delete_payment_voucher
  AFTER DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.delete_cascade_voucher();

-- Balance recalculation
DROP TRIGGER IF EXISTS trg_ledgers_balance ON public.ledgers;
DROP FUNCTION IF EXISTS public.update_ledger_current_balance();

CREATE OR REPLACE FUNCTION public.recalculate_ledger_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ledger_id UUID;
  v_company_id UUID;
  v_fy TEXT;
  v_total_debit NUMERIC(18,4);
  v_total_credit NUMERIC(18,4);
  v_opening NUMERIC(18,4);
  v_current NUMERIC(18,4);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ledger_id := OLD.ledger_id;
    v_company_id := OLD.company_id;
  ELSE
    v_ledger_id := NEW.ledger_id;
    v_company_id := NEW.company_id;
  END IF;

  v_fy := public.get_financial_year(CURRENT_DATE);

  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_total_debit, v_total_credit
  FROM public.journal_voucher_lines
  WHERE ledger_id = v_ledger_id;

  SELECT COALESCE(opening_balance, 0) INTO v_opening
  FROM public.ledger_balances
  WHERE ledger_id = v_ledger_id AND financial_year = v_fy;

  v_opening := COALESCE(v_opening, 0);
  v_current := v_opening + v_total_debit - v_total_credit;

  INSERT INTO public.ledger_balances (
    ledger_id, company_id, financial_year, opening_balance, opening_balance_type,
    current_balance, total_debit, total_credit, closing_balance, closing_balance_type
  ) VALUES (
    v_ledger_id, v_company_id, v_fy,
    v_opening, 'debit'::public.balance_type,
    v_current, v_total_debit, v_total_credit,
    v_current,
    CASE WHEN v_current >= 0 THEN 'debit'::public.balance_type ELSE 'credit'::public.balance_type END
  )
  ON CONFLICT (ledger_id, financial_year) DO UPDATE SET
    current_balance = EXCLUDED.current_balance,
    total_debit = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    closing_balance = EXCLUDED.closing_balance,
    closing_balance_type = EXCLUDED.closing_balance_type,
    updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_balance ON public.journal_voucher_lines;
CREATE TRIGGER trg_recalculate_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_voucher_lines
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_ledger_balance();

-- View: ledger_transaction_history
DROP VIEW IF EXISTS public.ledger_transaction_history CASCADE;
CREATE OR REPLACE VIEW public.ledger_transaction_history AS
SELECT
  jvl.ledger_id,
  jv.date,
  jv.reference_type AS ref_type,
  jv.reference_number AS ref_number,
  jv.narration,
  jvl.debit_amount AS debit,
  jvl.credit_amount AS credit,
  jv.created_at,
  jv.id AS voucher_id
FROM public.journal_voucher_lines jvl
JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id;

GRANT SELECT ON public.ledger_transaction_history TO authenticated;

-- RPC: get_ledger_transactions
CREATE OR REPLACE FUNCTION public.get_ledger_transactions(
  p_ledger_id UUID,
  p_year TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  date DATE,
  ref_type TEXT,
  ref_number TEXT,
  narration TEXT,
  debit NUMERIC,
  credit NUMERIC,
  running_balance NUMERIC,
  voucher_id UUID
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_rb NUMERIC(18,4) := 0;
  v_opening NUMERIC(18,4);
  v_fy TEXT;
BEGIN
  v_fy := COALESCE(p_year, public.get_financial_year(CURRENT_DATE));

  SELECT COALESCE(opening_balance, 0) INTO v_opening
  FROM public.ledger_balances
  WHERE ledger_id = p_ledger_id AND financial_year = v_fy;

  v_rb := COALESCE(v_opening, 0);

  RETURN QUERY
  WITH lines AS (
    SELECT
      jv.date,
      jv.reference_type::TEXT AS ref_type,
      jv.reference_number,
      jvl.narration,
      jvl.debit_amount,
      jvl.credit_amount,
      jv.id AS vid,
      jv.created_at
    FROM public.journal_voucher_lines jvl
    JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id
    WHERE jvl.ledger_id = p_ledger_id
      AND public.get_financial_year(jv.date) = v_fy
    ORDER BY jv.date ASC, jv.created_at ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    l.date,
    l.ref_type,
    l.reference_number,
    l.narration,
    l.debit_amount,
    l.credit_amount,
    (v_rb + SUM(l.debit_amount - l.credit_amount) OVER (ORDER BY l.date ASC, l.vid ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)),
    l.vid
  FROM lines l
  ORDER BY l.date DESC, l.vid DESC;
END;
$$;

-- View: ledger_balances_with_names
DROP VIEW IF EXISTS public.ledger_balances_with_names CASCADE;
CREATE OR REPLACE VIEW public.ledger_balances_with_names AS
SELECT
  l.id,
  l.company_id,
  l.name,
  l.alias,
  l.ledger_code,
  l.opening_balance,
  l.balance_type,
  lb.financial_year,
  lb.current_balance,
  lb.total_debit,
  lb.total_credit,
  lb.closing_balance,
  lb.closing_balance_type,
  COALESCE(array_agg(DISTINCT lr.role_type::text) FILTER (WHERE lr.role_type IS NOT NULL), ARRAY[]::text[]) AS roles,
  lg.name AS group_name,
  lg.group_type
FROM public.ledgers l
LEFT JOIN public.ledger_balances lb ON lb.ledger_id = l.id
LEFT JOIN public.ledger_roles lr ON lr.ledger_id = l.id
LEFT JOIN public.ledger_groups lg ON lg.id = l.ledger_group_id
GROUP BY l.id, lb.financial_year, lb.current_balance, lb.total_debit, lb.total_credit, lb.closing_balance, lb.closing_balance_type, lg.name, lg.group_type;

GRANT SELECT ON public.ledger_balances_with_names TO authenticated;
