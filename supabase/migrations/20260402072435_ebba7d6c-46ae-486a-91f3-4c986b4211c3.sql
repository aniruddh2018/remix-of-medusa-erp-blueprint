
-- Financial Year status enum
CREATE TYPE public.fy_status AS ENUM ('active', 'closed', 'archived');

-- Financial Years table
CREATE TABLE public.financial_years (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status public.fy_status NOT NULL DEFAULT 'active',
  closed_by UUID NULL,
  closed_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own company FYs"
  ON public.financial_years FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Admins manage own company FYs"
  ON public.financial_years FOR ALL
  TO authenticated
  USING ((has_role(auth.uid(), 'admin') OR is_super_admin(auth.uid())) AND company_id = get_user_company_id(auth.uid()))
  WITH CHECK ((has_role(auth.uid(), 'admin') OR is_super_admin(auth.uid())) AND company_id = get_user_company_id(auth.uid()));

CREATE TRIGGER update_financial_years_updated_at
  BEFORE UPDATE ON public.financial_years
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Opening Balances table
CREATE TABLE public.opening_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  financial_year_id UUID NOT NULL REFERENCES public.financial_years(id) ON DELETE CASCADE,
  balance_type TEXT NOT NULL, -- 'customer', 'supplier', 'inventory'
  reference_id UUID NOT NULL, -- customer_id, supplier_id, or product_id
  reference_name TEXT NOT NULL,
  debit_amount NUMERIC NOT NULL DEFAULT 0,
  credit_amount NUMERIC NOT NULL DEFAULT 0,
  quantity INTEGER NULL, -- for inventory type
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own company opening balances"
  ON public.opening_balances FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Admins manage own company opening balances"
  ON public.opening_balances FOR ALL
  TO authenticated
  USING ((has_role(auth.uid(), 'admin') OR is_super_admin(auth.uid())) AND company_id = get_user_company_id(auth.uid()))
  WITH CHECK ((has_role(auth.uid(), 'admin') OR is_super_admin(auth.uid())) AND company_id = get_user_company_id(auth.uid()));

CREATE TRIGGER update_opening_balances_updated_at
  BEFORE UPDATE ON public.opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FY Audit Logs table (immutable)
CREATE TABLE public.fy_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  financial_year_id UUID NULL REFERENCES public.financial_years(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fy_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own company FY audit logs"
  ON public.fy_audit_logs FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Admins insert FY audit logs"
  ON public.fy_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'admin') OR is_super_admin(auth.uid())) AND company_id = get_user_company_id(auth.uid()));

-- Helper function: get current FY for a company
CREATE OR REPLACE FUNCTION public.get_current_financial_year(_company_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.financial_years
  WHERE company_id = _company_id AND status = 'active'
  ORDER BY start_date DESC LIMIT 1
$$;

-- Helper function: determine FY name from a date
CREATE OR REPLACE FUNCTION public.get_fy_name(_date DATE)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM _date) >= 4
    THEN 'FY ' || EXTRACT(YEAR FROM _date)::TEXT || '-' || SUBSTRING(((EXTRACT(YEAR FROM _date) + 1)::TEXT) FROM 3)
    ELSE 'FY ' || (EXTRACT(YEAR FROM _date) - 1)::TEXT || '-' || SUBSTRING((EXTRACT(YEAR FROM _date)::TEXT) FROM 3)
  END
$$;
