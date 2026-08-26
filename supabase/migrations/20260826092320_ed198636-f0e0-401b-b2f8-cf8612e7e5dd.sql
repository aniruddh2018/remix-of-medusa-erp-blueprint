-- Backfill migration: records objects that exist in the live database but were
-- never captured in a migration file (FY audit logs, opening balances, company
-- membership helpers, offline-sync triggers/indexes).
-- Idempotent: no-op on the current database, reproduces schema on a fresh one.

CREATE OR REPLACE FUNCTION public.user_has_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_companies
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

CREATE OR REPLACE FUNCTION public.get_fy_name(_date date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM _date) >= 4
    THEN 'FY ' || EXTRACT(YEAR FROM _date)::TEXT || '-' || SUBSTRING(((EXTRACT(YEAR FROM _date) + 1)::TEXT) FROM 3)
    ELSE 'FY ' || (EXTRACT(YEAR FROM _date) - 1)::TEXT || '-' || SUBSTRING((EXTRACT(YEAR FROM _date)::TEXT) FROM 3)
  END
$$;

CREATE OR REPLACE FUNCTION public.get_current_financial_year(_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.financial_years
  WHERE company_id = _company_id AND status = 'active'
  ORDER BY start_date DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.add_user_to_company(_user_id uuid, _company_id uuid, _role public.app_role DEFAULT 'staff'::public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT (public.is_super_admin(_caller)
          OR (public.has_role(_caller, 'admin'::public.app_role)
              AND public.get_user_company_id(_caller) = _company_id)) THEN
    RAISE EXCEPTION 'Not authorized to add users to this company';
  END IF;

  INSERT INTO public.user_companies (user_id, company_id, role)
  VALUES (_user_id, _company_id, _role)
  ON CONFLICT (user_id, company_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;

CREATE OR REPLACE FUNCTION public.switch_active_company(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user uuid := auth.uid();
  _btype text;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT (public.is_super_admin(_user) OR public.user_has_company(_user, _company_id)) THEN
    RAISE EXCEPTION 'You are not a member of that company';
  END IF;

  SELECT business_type INTO _btype FROM public.companies WHERE id = _company_id;

  UPDATE public.profiles
  SET company_id = _company_id,
      business_module = COALESCE(_btype, business_module),
      updated_at = now()
  WHERE user_id = _user;

  DELETE FROM public.user_roles
  WHERE user_id = _user AND role <> 'super_admin';

  INSERT INTO public.user_roles (user_id, role)
  SELECT _user, role FROM public.user_companies
  WHERE user_id = _user AND company_id = _company_id
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

CREATE TABLE IF NOT EXISTS public.fy_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.fy_audit_logs TO authenticated;
GRANT ALL ON public.fy_audit_logs TO service_role;

ALTER TABLE public.fy_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own company FY audit logs" ON public.fy_audit_logs;
CREATE POLICY "View own company FY audit logs"
ON public.fy_audit_logs FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins insert FY audit logs" ON public.fy_audit_logs;
CREATE POLICY "Admins insert FY audit logs"
ON public.fy_audit_logs FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
  AND company_id = public.get_user_company_id(auth.uid())
);

CREATE TABLE IF NOT EXISTS public.opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  financial_year_id uuid NOT NULL REFERENCES public.financial_years(id) ON DELETE CASCADE,
  balance_type text NOT NULL,
  reference_id uuid NOT NULL,
  reference_name text NOT NULL,
  debit_amount numeric NOT NULL DEFAULT 0,
  credit_amount numeric NOT NULL DEFAULT 0,
  quantity integer,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.opening_balances ADD COLUMN IF NOT EXISTS reference_name text NOT NULL DEFAULT '';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opening_balances TO authenticated;
GRANT ALL ON public.opening_balances TO service_role;

ALTER TABLE public.opening_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own company opening balances" ON public.opening_balances;
CREATE POLICY "View own company opening balances"
ON public.opening_balances FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage own company opening balances" ON public.opening_balances;
CREATE POLICY "Admins manage own company opening balances"
ON public.opening_balances TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
  AND company_id = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
  AND company_id = public.get_user_company_id(auth.uid())
);

DROP TRIGGER IF EXISTS update_opening_balances_updated_at ON public.opening_balances;
CREATE TRIGGER update_opening_balances_updated_at
BEFORE UPDATE ON public.opening_balances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "View own company FYs" ON public.financial_years;
CREATE POLICY "View own company FYs"
ON public.financial_years FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage own company FYs" ON public.financial_years;
CREATE POLICY "Admins manage own company FYs"
ON public.financial_years TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
  AND company_id = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
  AND company_id = public.get_user_company_id(auth.uid())
);

DROP TRIGGER IF EXISTS update_financial_years_updated_at ON public.financial_years;
CREATE TRIGGER update_financial_years_updated_at
BEFORE UPDATE ON public.financial_years
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Users view own memberships" ON public.user_companies;
CREATE POLICY "Users view own memberships"
ON public.user_companies FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage company memberships" ON public.user_companies;
CREATE POLICY "Admins manage company memberships"
ON public.user_companies TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND company_id = public.get_user_company_id(auth.uid()))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND company_id = public.get_user_company_id(auth.uid()))
);

CREATE INDEX IF NOT EXISTS idx_user_companies_user ON public.user_companies USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_company ON public.user_companies USING btree (company_id);

DO $$
DECLARE
  t text;
  sync_tables text[] := ARRAY[
    'products','customers','suppliers','doctors','payments',
    'sales_orders','sales_order_items','purchase_orders','purchase_order_items',
    'credit_notes','credit_note_items','debit_notes','debit_note_items',
    'inventory_batches','inventory_transactions'
  ];
BEGIN
  FOREACH t IN ARRAY sync_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_bump_version', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_sync_version()',
      t || '_bump_version', t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I USING btree (updated_at)',
      t || '_updated_at_idx', t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I USING btree (deleted) WHERE (deleted = false)',
      t || '_not_deleted_idx', t
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_company_invoice_unique') THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_company_invoice_unique UNIQUE (company_id, invoice_number);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_company_invoice_unique') THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_company_invoice_unique UNIQUE (company_id, invoice_number);
  END IF;
END $$;