-- ============================================================================
-- Unified Ledger System for Dawa Dukan ERP
-- Inspired by: Marg ERP, Tally, SAP Business One, Oracle ERP
-- 
-- Principles:
--   1. Single ledger table for ALL parties (customer, supplier, manufacturer, etc.)
--   2. Roles assigned via ledger_roles (many-to-many)
--   3. Hierarchy via ledger_groups with materialized path
--   4. Multi-tenant by company_id with RLS
--   5. Scalable to 1M+ ledgers via indexing + path-based queries
-- ============================================================================

-- ─── ENUMS ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE ledger_group_type AS ENUM (
    'assets', 'liabilities', 'income', 'expenses', 'capital',
    'bank', 'cash', 'tax', 'sundry_debtors', 'sundry_creditors',
    'loan', 'investment', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ledger_role_type AS ENUM (
    'customer', 'supplier', 'manufacturer', 'distributor',
    'employee', 'doctor', 'bank', 'tax', 'expense', 'income', 'asset', 'liability'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE balance_type AS ENUM ('debit', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 1. LEDGER_GROUPS ─────────────────────────────────────────────────────
-- Hierarchical accounting groups. Materialized path for fast subtree queries.

CREATE TABLE IF NOT EXISTS public.ledger_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.ledger_groups(id) ON DELETE SET NULL,
  group_type ledger_group_type NOT NULL DEFAULT 'other',
  materialized_path TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  affects_stock BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  source_system TEXT DEFAULT 'manual' CHECK (source_system IN ('manual','tally','marg','imported')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, name)
);

CREATE INDEX idx_ledger_groups_company ON public.ledger_groups(company_id);
CREATE INDEX idx_ledger_groups_parent ON public.ledger_groups(parent_id);
CREATE INDEX idx_ledger_groups_path ON public.ledger_groups(company_id, materialized_path);
CREATE INDEX idx_ledger_groups_type ON public.ledger_groups(company_id, group_type);
CREATE INDEX idx_ledger_groups_active ON public.ledger_groups(company_id, is_active);

ALTER TABLE public.ledger_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_groups_view ON public.ledger_groups
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_groups_manage ON public.ledger_groups
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 2. LEDGERS ────────────────────────────────────────────────────────────
-- Unified master for ALL parties. One table replaces customers, suppliers, manufacturers, etc.

CREATE TABLE IF NOT EXISTS public.ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ledger_group_id UUID REFERENCES public.ledger_groups(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  alias TEXT,
  ledger_code TEXT, -- internal code/sku for quick lookup
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  balance_type balance_type NOT NULL DEFAULT 'debit',
  current_balance NUMERIC(18,4) NOT NULL DEFAULT 0,

  -- GST / Tax
  gst_number TEXT,
  gst_registration_type TEXT DEFAULT 'regular' CHECK (gst_registration_type IN ('regular','composition','unregistered','ecommerce')),
  pan_number TEXT,
  tax_id TEXT,

  -- Contact
  contact_person TEXT,
  phone TEXT,
  mobile TEXT,
  email TEXT,
  website TEXT,

  -- Address (JSONB for flexibility — can have multiple addresses later)
  address JSONB DEFAULT '{}',
  billing_address JSONB DEFAULT '{}',
  shipping_address JSONB DEFAULT '{}',
  city TEXT,
  state TEXT,
  pincode TEXT,
  country TEXT DEFAULT 'India',

  -- Bank (for payment integration)
  bank_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_branch TEXT,

  -- Classification
  party_type TEXT DEFAULT 'other' CHECK (party_type IN (
    'individual','proprietorship','partnership','llp','pvt_ltd','ltd','trust','other'
  )),

  -- ERP Integration
  source_system TEXT DEFAULT 'manual' CHECK (source_system IN ('manual','tally','marg','imported')),
  source_ledger_name TEXT, -- original name from import
  source_group_name TEXT,  -- original group from import
  import_metadata JSONB DEFAULT '{}',

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(company_id, name)
);

CREATE INDEX idx_ledgers_company ON public.ledgers(company_id);
CREATE INDEX idx_ledgers_group ON public.ledgers(ledger_group_id);
CREATE INDEX idx_ledgers_name ON public.ledgers(company_id, name);
CREATE INDEX idx_ledgers_code ON public.ledgers(company_id, ledger_code);
CREATE INDEX idx_ledgers_gst ON public.ledgers(company_id, gst_number);
CREATE INDEX idx_ledgers_active ON public.ledgers(company_id, is_active);
CREATE INDEX idx_ledgers_source ON public.ledgers(company_id, source_system);

-- Full-text search on name + alias
CREATE INDEX idx_ledgers_search ON public.ledgers USING gin(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(alias,'')));

ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledgers_view ON public.ledgers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledgers_manage ON public.ledgers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 3. LEDGER_ROLES ──────────────────────────────────────────────────────
-- Many-to-many: a ledger can have multiple roles (customer + supplier + manufacturer)

CREATE TABLE IF NOT EXISTS public.ledger_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role_type ledger_role_type NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ledger_id, role_type)
);

CREATE INDEX idx_ledger_roles_ledger ON public.ledger_roles(ledger_id);
CREATE INDEX idx_ledger_roles_company ON public.ledger_roles(company_id);
CREATE INDEX idx_ledger_roles_type ON public.ledger_roles(company_id, role_type);
CREATE INDEX idx_ledger_roles_primary ON public.ledger_roles(ledger_id, is_primary);

ALTER TABLE public.ledger_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_roles_view ON public.ledger_roles
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_roles_manage ON public.ledger_roles
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 4. LEDGER_BALANCES ────────────────────────────────────────────────────
-- Per-financial-year balances for accounting integration

CREATE TABLE IF NOT EXISTS public.ledger_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL, -- e.g. "2025-2026"
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  opening_balance_type balance_type NOT NULL DEFAULT 'debit',
  current_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_debit NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_credit NUMERIC(18,4) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  closing_balance_type balance_type NOT NULL DEFAULT 'debit',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ledger_id, financial_year)
);

CREATE INDEX idx_ledger_balances_ledger ON public.ledger_balances(ledger_id);
CREATE INDEX idx_ledger_balances_company ON public.ledger_balances(company_id);
CREATE INDEX idx_ledger_balances_year ON public.ledger_balances(company_id, financial_year);

ALTER TABLE public.ledger_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_balances_view ON public.ledger_balances
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_balances_manage ON public.ledger_balances
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 5. LEDGER_IMPORT_SESSIONS ──────────────────────────────────────────────
-- Tracks bulk import operations for ledgers/groups

CREATE TABLE IF NOT EXISTS public.ledger_import_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'tally' CHECK (source_system IN ('tally','marg','csv','manual')),
  file_name TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN (
    'uploaded','parsing','staging','reviewing','importing','completed','failed','rolled_back'
  )),
  groups_imported INTEGER DEFAULT 0,
  ledgers_imported INTEGER DEFAULT 0,
  groups_failed INTEGER DEFAULT 0,
  ledgers_failed INTEGER DEFAULT 0,
  duplicate_groups INTEGER DEFAULT 0,
  duplicate_ledgers INTEGER DEFAULT 0,
  error_log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ledger_import_sessions_company ON public.ledger_import_sessions(company_id);
CREATE INDEX idx_ledger_import_sessions_status ON public.ledger_import_sessions(status);

ALTER TABLE public.ledger_import_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_import_sessions_view ON public.ledger_import_sessions
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_import_sessions_manage ON public.ledger_import_sessions
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 6. STAGING_LEDGER_GROUPS ─────────────────────────────────────────────
-- Pre-import staging for groups

CREATE TABLE IF NOT EXISTS public.staging_ledger_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ledger_import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  parent_name TEXT,
  group_type TEXT DEFAULT 'other',
  materialized_path TEXT DEFAULT '',
  level INTEGER DEFAULT 0,
  affects_stock BOOLEAN DEFAULT false,
  source_data JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','imported','skipped')),
  validation_errors JSONB DEFAULT '[]',
  mapped_group_id UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_staging_ledger_groups_session ON public.staging_ledger_groups(session_id);
CREATE INDEX idx_staging_ledger_groups_status ON public.staging_ledger_groups(validation_status);

ALTER TABLE public.staging_ledger_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY staging_ledger_groups_view ON public.staging_ledger_groups
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY staging_ledger_groups_manage ON public.staging_ledger_groups
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 7. STAGING_LEDGERS ────────────────────────────────────────────────────
-- Pre-import staging for ledgers

CREATE TABLE IF NOT EXISTS public.staging_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ledger_import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  alias TEXT,
  parent_group_name TEXT,
  ledger_code TEXT,
  opening_balance NUMERIC(18,4) DEFAULT 0,
  balance_type TEXT DEFAULT 'debit',
  gst_number TEXT,
  pan_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  state TEXT,
  city TEXT,
  pincode TEXT,
  country TEXT,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  contact_person TEXT,
  role_types TEXT[] DEFAULT '{}',
  source_data JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','imported','skipped')),
  validation_errors JSONB DEFAULT '[]',
  mapped_ledger_id UUID,
  mapped_group_id UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_staging_ledgers_session ON public.staging_ledgers(session_id);
CREATE INDEX idx_staging_ledgers_status ON public.staging_ledgers(validation_status);

ALTER TABLE public.staging_ledgers ENABLE ROW LEVEL SECURITY;

CREATE POLICY staging_ledgers_view ON public.staging_ledgers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY staging_ledgers_manage ON public.staging_ledgers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── FUNCTIONS ─────────────────────────────────────────────────────────────

-- Update materialized path after group insert/update
CREATE OR REPLACE FUNCTION public.update_ledger_group_path()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.materialized_path := NEW.id::text || '.';
    NEW.level := 0;
  ELSE
    SELECT materialized_path || NEW.id::text || '.', level + 1
    INTO NEW.materialized_path, NEW.level
    FROM public.ledger_groups
    WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_group_path ON public.ledger_groups;
CREATE TRIGGER trg_ledger_group_path
  BEFORE INSERT OR UPDATE OF parent_id ON public.ledger_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_ledger_group_path();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_groups_updated ON public.ledger_groups;
CREATE TRIGGER trg_ledger_groups_updated
  BEFORE UPDATE ON public.ledger_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ledgers_updated ON public.ledgers;
CREATE TRIGGER trg_ledgers_updated
  BEFORE UPDATE ON public.ledgers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ledger_balances_updated ON public.ledger_balances;
CREATE TRIGGER trg_ledger_balances_updated
  BEFORE UPDATE ON public.ledger_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ledger_import_sessions_updated ON public.ledger_import_sessions;
CREATE TRIGGER trg_ledger_import_sessions_updated
  BEFORE UPDATE ON public.ledger_import_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: get all descendant group IDs (fast via materialized path)
CREATE OR REPLACE FUNCTION public.get_ledger_group_descendants(p_group_id UUID)
RETURNS TABLE(id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT g.id FROM public.ledger_groups g
  WHERE g.materialized_path LIKE (
    (SELECT materialized_path FROM public.ledger_groups WHERE id = p_group_id) || '%'
  )
  AND g.id != p_group_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: get all ancestor group IDs
CREATE OR REPLACE FUNCTION public.get_ledger_group_ancestors(p_group_id UUID)
RETURNS TABLE(id UUID) AS $$
DECLARE
  v_path TEXT;
BEGIN
  SELECT materialized_path INTO v_path FROM public.ledger_groups WHERE id = p_group_id;
  IF v_path IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT g.id FROM public.ledger_groups g
  WHERE v_path LIKE g.materialized_path || '%'
  AND g.id != p_group_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: auto-create ledger_roles from staging
CREATE OR REPLACE FUNCTION public.create_ledger_roles_from_staging(
  p_ledger_id UUID,
  p_company_id UUID,
  p_role_types TEXT[]
)
RETURNS VOID AS $$
DECLARE
  v_role TEXT;
BEGIN
  FOREACH v_role IN ARRAY p_role_types LOOP
    INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
    VALUES (p_ledger_id, p_company_id, v_role::public.ledger_role_type, false)
    ON CONFLICT (ledger_id, role_type) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Helper: auto-update current_balance on ledger update (basic)
CREATE OR REPLACE FUNCTION public.update_ledger_current_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Placeholder: real implementation would sum from journal entries
  NEW.current_balance := NEW.opening_balance;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledgers_balance ON public.ledgers;
CREATE TRIGGER trg_ledgers_balance
  BEFORE INSERT OR UPDATE OF opening_balance ON public.ledgers
  FOR EACH ROW EXECUTE FUNCTION public.update_ledger_current_balance();

-- Seed default system groups per company (run after company creation)
CREATE OR REPLACE FUNCTION public.seed_default_ledger_groups(p_company_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.ledger_groups (company_id, name, group_type, is_system, sort_order)
  VALUES
    (p_company_id, 'Assets', 'assets', true, 1),
    (p_company_id, 'Liabilities', 'liabilities', true, 2),
    (p_company_id, 'Income', 'income', true, 3),
    (p_company_id, 'Expenses', 'expenses', true, 4),
    (p_company_id, 'Capital Account', 'capital', true, 5),
    (p_company_id, 'Bank Accounts', 'bank', true, 6),
    (p_company_id, 'Cash-in-Hand', 'cash', true, 7),
    (p_company_id, 'Duties & Taxes', 'tax', true, 8),
    (p_company_id, 'Sundry Debtors', 'sundry_debtors', true, 9),
    (p_company_id, 'Sundry Creditors', 'sundry_creditors', true, 10),
    (p_company_id, 'Loans', 'loan', true, 11),
    (p_company_id, 'Investments', 'investment', true, 12)
  ON CONFLICT (company_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- View: ledgers with roles as array (for API convenience)
CREATE OR REPLACE VIEW public.ledgers_with_roles AS
SELECT
  l.*,
  COALESCE(
    array_agg(DISTINCT lr.role_type) FILTER (WHERE lr.role_type IS NOT NULL),
    ARRAY[]::public.ledger_role_type[]
  ) as roles,
  COALESCE(
    (SELECT lr2.role_type FROM public.ledger_roles lr2
     WHERE lr2.ledger_id = l.id AND lr2.is_primary = true LIMIT 1),
    NULL
  ) as primary_role
FROM public.ledgers l
LEFT JOIN public.ledger_roles lr ON lr.ledger_id = l.id
GROUP BY l.id;

-- RLS on view
ALTER VIEW public.ledgers_with_roles OWNER TO postgres;

-- Grant select on view
GRANT SELECT ON public.ledgers_with_roles TO authenticated;
GRANT SELECT ON public.ledgers_with_roles TO anon;
