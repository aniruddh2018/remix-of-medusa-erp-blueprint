-- ============================================================================
-- Fix: Upgrade existing ledger_groups + ledgers to unified ledger system
-- The 20260529000000 migration failed because ledger_groups/ledgers already
-- existed from 20260528000000 with a simpler schema. This ALTER migration
-- adds the missing columns, creates new tables, and sets up triggers/views.
-- ============================================================================

-- ─── 1. ADD MISSING COLUMNS TO ledger_groups ────────────────────────────────

ALTER TABLE public.ledger_groups ADD COLUMN IF NOT EXISTS group_type TEXT NOT NULL DEFAULT 'other';
ALTER TABLE public.ledger_groups ADD COLUMN IF NOT EXISTS materialized_path TEXT NOT NULL DEFAULT '';
ALTER TABLE public.ledger_groups ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.ledger_groups ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.ledger_groups ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.ledger_groups ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Backfill group_type from reserved_name or name heuristics
UPDATE public.ledger_groups SET group_type = CASE
  WHEN name ILIKE '%sundry creditor%' THEN 'sundry_creditors'
  WHEN name ILIKE '%sundry debtor%' THEN 'sundry_debtors'
  WHEN name ILIKE '%bank account%' THEN 'bank'
  WHEN name ILIKE '%cash%' THEN 'cash'
  WHEN name ILIKE '%duties%' OR name ILIKE '%tax%' THEN 'tax'
  WHEN name ILIKE '%capital%' THEN 'capital'
  WHEN name ILIKE '%asset%' THEN 'assets'
  WHEN name ILIKE '%liabilit%' OR name ILIKE '%provision%' THEN 'liabilities'
  WHEN name ILIKE '%expense%' OR name ILIKE '%cost%' THEN 'expenses'
  WHEN name ILIKE '%income%' OR name ILIKE '%revenue%' OR name ILIKE '%sale%' THEN 'income'
  WHEN name ILIKE '%loan%' THEN 'loan'
  WHEN name ILIKE '%invest%' THEN 'investment'
  ELSE 'other'
END
WHERE group_type = 'other' AND group_type IS NOT NULL;

-- Drop old duplicate indexes from new migration (if they were created before failure)
DROP INDEX IF EXISTS public.idx_ledger_groups_company;
DROP INDEX IF EXISTS public.idx_ledger_groups_parent;

-- Create new indexes
CREATE INDEX IF NOT EXISTS idx_ledger_groups_path ON public.ledger_groups(company_id, materialized_path);
CREATE INDEX IF NOT EXISTS idx_ledger_groups_type ON public.ledger_groups(company_id, group_type);
CREATE INDEX IF NOT EXISTS idx_ledger_groups_active ON public.ledger_groups(company_id, is_active);

-- Update RLS policies (replace old ones)
DROP POLICY IF EXISTS ledger_groups_view_own ON public.ledger_groups;
DROP POLICY IF EXISTS ledger_groups_manage_own ON public.ledger_groups;

CREATE POLICY ledger_groups_view ON public.ledger_groups
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_groups_manage ON public.ledger_groups
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 2. ADD MISSING COLUMNS TO ledgers ──────────────────────────────────────

ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS ledger_group_id UUID REFERENCES public.ledger_groups(id) ON DELETE SET NULL;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS alias TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS ledger_code TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS current_balance NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS gst_registration_type TEXT DEFAULT 'regular' CHECK (gst_registration_type IN ('regular','composition','unregistered','ecommerce'));
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS address JSONB DEFAULT '{}';
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS billing_address JSONB DEFAULT '{}';
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS shipping_address JSONB DEFAULT '{}';
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India';
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS bank_branch TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS party_type TEXT DEFAULT 'other' CHECK (party_type IN ('individual','proprietorship','partnership','llp','pvt_ltd','ltd','trust','other'));
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS source_group_name TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS import_metadata JSONB DEFAULT '{}';

-- Migrate group_id → ledger_group_id
UPDATE public.ledgers SET ledger_group_id = group_id WHERE group_id IS NOT NULL AND ledger_group_id IS NULL;

-- Migrate old text address to JSONB address (if old address column was text)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ledgers'
    AND column_name = 'address' AND data_type = 'text'
  ) THEN
    UPDATE public.ledgers SET address = jsonb_build_object('line1', address) WHERE address IS NOT NULL AND address != '{}' AND address::text != 'null';
    ALTER TABLE public.ledgers ALTER COLUMN address TYPE JSONB USING address::jsonb;
  END IF;
END $$;

-- Drop old duplicate indexes
DROP INDEX IF EXISTS public.idx_ledgers_company;
DROP INDEX IF EXISTS public.idx_ledgers_group;
DROP INDEX IF EXISTS public.idx_ledgers_type;

-- Create new indexes
CREATE INDEX IF NOT EXISTS idx_ledgers_group ON public.ledgers(ledger_group_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_code ON public.ledgers(company_id, ledger_code);
CREATE INDEX IF NOT EXISTS idx_ledgers_gst ON public.ledgers(company_id, gst_number);
CREATE INDEX IF NOT EXISTS idx_ledgers_active ON public.ledgers(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ledgers_source ON public.ledgers(company_id, source_system);
CREATE INDEX IF NOT EXISTS idx_ledgers_search ON public.ledgers USING gin(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(alias,'')));

-- Update RLS policies
DROP POLICY IF EXISTS ledgers_view_own ON public.ledgers;
DROP POLICY IF EXISTS ledgers_manage_own ON public.ledgers;

CREATE POLICY ledgers_view ON public.ledgers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledgers_manage ON public.ledgers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 3. CREATE ledger_roles (NEW TABLE) ──────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.ledger_role_type AS ENUM (
    'customer', 'supplier', 'manufacturer', 'distributor',
    'employee', 'doctor', 'bank', 'tax', 'expense', 'income', 'asset', 'liability'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.ledger_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role_type public.ledger_role_type NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ledger_id, role_type)
);

CREATE INDEX IF NOT EXISTS idx_ledger_roles_ledger ON public.ledger_roles(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_roles_company ON public.ledger_roles(company_id);
CREATE INDEX IF NOT EXISTS idx_ledger_roles_type ON public.ledger_roles(company_id, role_type);
CREATE INDEX IF NOT EXISTS idx_ledger_roles_primary ON public.ledger_roles(ledger_id, is_primary);

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

-- ─── 4. CREATE ledger_balances (NEW TABLE) ─────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.balance_type AS ENUM ('debit', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.ledger_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  opening_balance_type public.balance_type NOT NULL DEFAULT 'debit',
  current_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_debit NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_credit NUMERIC(18,4) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  closing_balance_type public.balance_type NOT NULL DEFAULT 'debit',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ledger_id, financial_year)
);

CREATE INDEX IF NOT EXISTS idx_ledger_balances_ledger ON public.ledger_balances(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_balances_company ON public.ledger_balances(company_id);
CREATE INDEX IF NOT EXISTS idx_ledger_balances_year ON public.ledger_balances(company_id, financial_year);

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

-- ─── 5. CREATE ledger_import_sessions (NEW TABLE) ──────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_ledger_import_sessions_company ON public.ledger_import_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_ledger_import_sessions_status ON public.ledger_import_sessions(status);

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

-- ─── 6. CREATE staging_ledger_groups (NEW TABLE) ────────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_staging_ledger_groups_session ON public.staging_ledger_groups(session_id);
CREATE INDEX IF NOT EXISTS idx_staging_ledger_groups_status ON public.staging_ledger_groups(validation_status);

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

-- ─── 7. ADD MISSING COLUMNS TO staging_ledgers ───────────────────────────────

ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS alias TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS ledger_code TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS role_types TEXT[] DEFAULT '{}';
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS mapped_ledger_id UUID;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS mapped_group_id UUID;

-- ─── 8. FUNCTIONS & TRIGGERS ───────────────────────────────────────────────

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

CREATE OR REPLACE FUNCTION public.create_ledger_roles_from_staging(
  p_ledger_id UUID, p_company_id UUID, p_role_types TEXT[]
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

CREATE OR REPLACE FUNCTION public.update_ledger_current_balance()
RETURNS TRIGGER AS $$
BEGIN
  NEW.current_balance := NEW.opening_balance;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledgers_balance ON public.ledgers;
CREATE TRIGGER trg_ledgers_balance
  BEFORE INSERT OR UPDATE OF opening_balance ON public.ledgers
  FOR EACH ROW EXECUTE FUNCTION public.update_ledger_current_balance();

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

-- ─── 9. VIEW: ledgers_with_roles ────────────────────────────────────────────

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

ALTER VIEW public.ledgers_with_roles OWNER TO postgres;
GRANT SELECT ON public.ledgers_with_roles TO authenticated;
GRANT SELECT ON public.ledgers_with_roles TO anon;

-- ─── 10. BACKFILL: Create ledger_roles from existing ledger_type ─────────────

INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary, priority)
SELECT id, company_id,
  CASE ledger_type
    WHEN 'supplier' THEN 'supplier'::public.ledger_role_type
    WHEN 'customer' THEN 'customer'::public.ledger_role_type
    WHEN 'bank' THEN 'bank'::public.ledger_role_type
    WHEN 'gst' THEN 'tax'::public.ledger_role_type
    WHEN 'tax' THEN 'tax'::public.ledger_role_type
    WHEN 'expense' THEN 'expense'::public.ledger_role_type
    WHEN 'income' THEN 'income'::public.ledger_role_type
    WHEN 'asset' THEN 'asset'::public.ledger_role_type
    WHEN 'liability' THEN 'liability'::public.ledger_role_type
    ELSE 'customer'::public.ledger_role_type
  END,
  true, 0
FROM public.ledgers
WHERE is_active = true
ON CONFLICT (ledger_id, role_type) DO NOTHING;
