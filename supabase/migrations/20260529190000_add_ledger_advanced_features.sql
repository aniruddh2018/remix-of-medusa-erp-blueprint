-- ============================================================================
-- Phase 6: Advanced Ledger Features
-- 1. ledger_audit_log — who changed what, when
-- 2. Financial year closing support (closing_balance_type on ledger_balances)
-- ============================================================================

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

CREATE INDEX idx_ledger_audit_log_company ON public.ledger_audit_log(company_id);
CREATE INDEX idx_ledger_audit_log_ledger ON public.ledger_audit_log(ledger_id);
CREATE INDEX idx_ledger_audit_log_action ON public.ledger_audit_log(company_id, action);
CREATE INDEX idx_ledger_audit_log_created ON public.ledger_audit_log(company_id, created_at DESC);

ALTER TABLE public.ledger_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_audit_log_view ON public.ledger_audit_log
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_audit_log_manage ON public.ledger_audit_log
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- Trigger: auto-log ledger changes
CREATE OR REPLACE FUNCTION public.log_ledger_audit()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_audit ON public.ledgers;
CREATE TRIGGER trg_ledger_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.ledgers
  FOR EACH ROW EXECUTE FUNCTION public.log_ledger_audit();

-- Function: close financial year
CREATE OR REPLACE FUNCTION public.close_financial_year(
  p_company_id UUID,
  p_financial_year TEXT
)
RETURNS TABLE(ledger_id UUID, name TEXT, closing_balance NUMERIC, closing_balance_type TEXT) AS $$
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
$$ LANGUAGE plpgsql;

-- Function: trial balance
CREATE OR REPLACE FUNCTION public.trial_balance(
  p_company_id UUID,
  p_financial_year TEXT
)
RETURNS TABLE(
  group_name TEXT,
  group_type TEXT,
  total_debit NUMERIC,
  total_credit NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(lg.name, 'Ungrouped') AS group_name,
    COALESCE(lg.group_type, 'other') AS group_type,
    SUM(CASE WHEN lb.closing_balance_type = 'debit' THEN lb.closing_balance ELSE 0 END) AS total_debit,
    SUM(CASE WHEN lb.closing_balance_type = 'credit' THEN lb.closing_balance ELSE 0 END) AS total_credit
  FROM public.ledger_balances lb
  JOIN public.ledgers l ON l.id = lb.ledger_id
  LEFT JOIN public.ledger_groups lg ON lg.id = l.ledger_group_id
  WHERE lb.company_id = p_company_id AND lb.financial_year = p_financial_year
  GROUP BY lg.name, lg.group_type
  ORDER BY lg.group_type, lg.name;
END;
$$ LANGUAGE plpgsql STABLE;
