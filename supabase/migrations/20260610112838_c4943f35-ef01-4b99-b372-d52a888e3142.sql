CREATE TABLE IF NOT EXISTS public.manufacturers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_system TEXT DEFAULT 'manual' CHECK (source_system IN ('manual','tally','marg','imported')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, name)
);
ALTER TABLE public.manufacturers ENABLE ROW LEVEL SECURITY;
CREATE POLICY manufacturers_view_own ON public.manufacturers FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY manufacturers_manage_own ON public.manufacturers FOR ALL USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid())) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_manufacturers_company_id ON public.manufacturers(company_id);
CREATE INDEX IF NOT EXISTS idx_manufacturers_name ON public.manufacturers(company_id, name);

CREATE TABLE IF NOT EXISTS public.gst_tax_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  hsn_code TEXT,
  gst_rate NUMERIC(5,2) NOT NULL,
  cgst_rate NUMERIC(5,2) DEFAULT 0,
  sgst_rate NUMERIC(5,2) DEFAULT 0,
  igst_rate NUMERIC(5,2) DEFAULT 0,
  cess_rate NUMERIC(5,2) DEFAULT 0,
  description TEXT,
  effective_from DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.gst_tax_structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY gst_tax_structures_view_own ON public.gst_tax_structures FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY gst_tax_structures_manage_own ON public.gst_tax_structures FOR ALL USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid())) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_gst_tax_structures_company_id ON public.gst_tax_structures(company_id);
CREATE INDEX IF NOT EXISTS idx_gst_tax_structures_hsn ON public.gst_tax_structures(company_id, hsn_code);

CREATE TABLE IF NOT EXISTS public.import_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Migration',
  source_system TEXT NOT NULL DEFAULT 'tally' CHECK (source_system IN ('tally','marg','csv','manual')),
  file_name TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','parsing','staging','reviewing','importing','completed','failed','rolled_back')),
  parse_summary JSONB DEFAULT '{}',
  staging_summary JSONB DEFAULT '{}',
  import_summary JSONB DEFAULT '{}',
  error_log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.import_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_sessions_view_own ON public.import_sessions FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY import_sessions_manage_own ON public.import_sessions FOR ALL USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid())) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_import_sessions_company_id ON public.import_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_import_sessions_status ON public.import_sessions(status);
CREATE INDEX IF NOT EXISTS idx_import_sessions_created_at ON public.import_sessions(created_at DESC);

CREATE TABLE IF NOT EXISTS public.staging_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  generic_name TEXT,
  manufacturer_name TEXT,
  category TEXT,
  hsn_code TEXT,
  unit TEXT DEFAULT 'PCS',
  mrp NUMERIC(10,2),
  purchase_price NUMERIC(10,2),
  sale_price NUMERIC(10,2),
  gst_percentage NUMERIC(5,2),
  drug_schedule TEXT DEFAULT 'none',
  composition TEXT,
  strength TEXT,
  opening_balance NUMERIC(18,6) DEFAULT 0,
  opening_value NUMERIC(18,6) DEFAULT 0,
  source_data JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','warning','imported','skipped')),
  validation_errors JSONB DEFAULT '[]',
  mapped_manufacturer_id UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.staging_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_products_view_own ON public.staging_products FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY staging_products_manage_own ON public.staging_products FOR ALL USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid())) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_staging_products_session ON public.staging_products(session_id);
CREATE INDEX IF NOT EXISTS idx_staging_products_company ON public.staging_products(company_id);
CREATE INDEX IF NOT EXISTS idx_staging_products_status ON public.staging_products(validation_status);

CREATE TABLE IF NOT EXISTS public.staging_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  product_name TEXT NOT NULL,
  batch_number TEXT,
  quantity NUMERIC(18,6) DEFAULT 0,
  mrp NUMERIC(10,2),
  purchase_price NUMERIC(10,2),
  expiry_date DATE,
  manufacturing_date DATE,
  supplier_name TEXT,
  godown_name TEXT,
  source_data JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','warning','imported','skipped')),
  validation_errors JSONB DEFAULT '[]',
  mapped_product_id UUID,
  mapped_supplier_id UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.staging_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_batches_view_own ON public.staging_batches FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY staging_batches_manage_own ON public.staging_batches FOR ALL USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid())) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_staging_batches_session ON public.staging_batches(session_id);
CREATE INDEX IF NOT EXISTS idx_staging_batches_company ON public.staging_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_staging_batches_status ON public.staging_batches(validation_status);

CREATE TABLE IF NOT EXISTS public.staging_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  gst_number TEXT,
  pan_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  state TEXT,
  contact_person TEXT,
  drug_license_number TEXT,
  parent_group_name TEXT,
  source_data JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','warning','imported','skipped')),
  validation_errors JSONB DEFAULT '[]',
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.staging_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_suppliers_view_own ON public.staging_suppliers FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY staging_suppliers_manage_own ON public.staging_suppliers FOR ALL USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid())) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_staging_suppliers_session ON public.staging_suppliers(session_id);
CREATE INDEX IF NOT EXISTS idx_staging_suppliers_company ON public.staging_suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_staging_suppliers_status ON public.staging_suppliers(validation_status);

ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_entity_type_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_entity_type_check CHECK (entity_type IN ('product','supplier','customer','inventory_batch','purchase_order','sales_order','payment','ledger_group','ledger','manufacturer','gst_structure'));
ALTER TABLE public.import_jobs ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.import_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_import_jobs_session_id ON public.import_jobs(session_id);

ALTER TABLE public.import_templates DROP CONSTRAINT IF EXISTS import_templates_entity_type_check;
ALTER TABLE public.import_templates ADD CONSTRAINT import_templates_entity_type_check CHECK (entity_type IN ('product','supplier','customer','inventory_batch','purchase_order','sales_order','payment','ledger_group','ledger','manufacturer','gst_structure'));

ALTER TABLE public.import_mappings DROP CONSTRAINT IF EXISTS import_mappings_entity_type_check;
ALTER TABLE public.import_mappings ADD CONSTRAINT import_mappings_entity_type_check CHECK (entity_type IN ('product','supplier','customer','inventory_batch','purchase_order','sales_order','payment','ledger_group','ledger','manufacturer','gst_structure'));

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturer_id UUID REFERENCES public.manufacturers(id);

DROP TRIGGER IF EXISTS update_manufacturers_updated_at ON public.manufacturers;
CREATE TRIGGER update_manufacturers_updated_at BEFORE UPDATE ON public.manufacturers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_import_sessions_updated_at ON public.import_sessions;
CREATE TRIGGER update_import_sessions_updated_at BEFORE UPDATE ON public.import_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- UNIFIED LEDGER SYSTEM
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE ledger_group_type AS ENUM ('assets','liabilities','income','expenses','capital','bank','cash','tax','sundry_debtors','sundry_creditors','loan','investment','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ledger_role_type AS ENUM ('customer','supplier','manufacturer','distributor','employee','doctor','bank','tax','expense','income','asset','liability');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE balance_type AS ENUM ('debit','credit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
CREATE INDEX IF NOT EXISTS idx_ledger_groups_company ON public.ledger_groups(company_id);
CREATE INDEX IF NOT EXISTS idx_ledger_groups_parent ON public.ledger_groups(parent_id);
CREATE INDEX IF NOT EXISTS idx_ledger_groups_path ON public.ledger_groups(company_id, materialized_path);
CREATE INDEX IF NOT EXISTS idx_ledger_groups_type ON public.ledger_groups(company_id, group_type);
CREATE INDEX IF NOT EXISTS idx_ledger_groups_active ON public.ledger_groups(company_id, is_active);
ALTER TABLE public.ledger_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_groups_view ON public.ledger_groups FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY ledger_groups_manage ON public.ledger_groups FOR ALL USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid())) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));

CREATE TABLE IF NOT EXISTS public.ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ledger_group_id UUID REFERENCES public.ledger_groups(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  alias TEXT,
  ledger_code TEXT,
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  balance_type balance_type NOT NULL DEFAULT 'debit',
  current_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  gst_number TEXT,
  gst_registration_type TEXT DEFAULT 'regular' CHECK (gst_registration_type IN ('regular','composition','unregistered','ecommerce')),
  pan_number TEXT,
  tax_id TEXT,
  contact_person TEXT,
  phone TEXT,
  mobile TEXT,
  email TEXT,
  website TEXT,
  address JSONB DEFAULT '{}',
  billing_address JSONB DEFAULT '{}',
  shipping_address JSONB DEFAULT '{}',
  city TEXT,
  state TEXT,
  pincode TEXT,
  country TEXT DEFAULT 'India',
  bank_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_branch TEXT,
  party_type TEXT DEFAULT 'other' CHECK (party_type IN ('individual','proprietorship','partnership','llp','pvt_ltd','ltd','trust','other')),
  source_system TEXT DEFAULT 'manual' CHECK (source_system IN ('manual','tally','marg','imported')),
  source_ledger_name TEXT,
  source_group_name TEXT,
  import_metadata JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, name)
);
CREATE INDEX IF NOT EXISTS idx_ledgers_company ON public.ledgers(company_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_group ON public.ledgers(ledger_group_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_name ON public.ledgers(company_id, name);
CREATE INDEX IF NOT EXISTS idx_ledgers_code ON public.ledgers(company_id, ledger_code);
CREATE INDEX IF NOT EXISTS idx_ledgers_gst ON public.ledgers(company_id, gst_number);
CREATE INDEX IF NOT EXISTS idx_ledgers_active ON public.ledgers(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ledgers_source ON public.ledgers(company_id, source_system);
CREATE INDEX IF NOT EXISTS idx_ledgers_search ON public.ledgers USING gin(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(alias,'')));
ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledgers_view ON public.ledgers FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY ledgers_manage ON public.ledgers FOR ALL USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid())) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));

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
CREATE INDEX IF NOT EXISTS idx_ledger_roles_ledger ON public.ledger_roles(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_roles_company ON public.ledger_roles(company_id);
CREATE INDEX IF NOT EXISTS idx_ledger_roles_type ON public.ledger_roles(company_id, role_type);
CREATE INDEX IF NOT EXISTS idx_ledger_roles_primary ON public.ledger_roles(ledger_id, is_primary);
ALTER TABLE public.ledger_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_roles_view ON public.ledger_roles FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY ledger_roles_manage ON public.ledger_roles FOR ALL USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid())) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));

CREATE TABLE IF NOT EXISTS public.ledger_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_ledger_balances_ledger ON public.ledger_balances(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_balances_company ON public.ledger_balances(company_id);
CREATE INDEX IF NOT EXISTS idx_ledger_balances_year ON public.ledger_balances(company_id, financial_year);
ALTER TABLE public.ledger_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_balances_view ON public.ledger_balances FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY ledger_balances_manage ON public.ledger_balances FOR ALL USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid())) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));

CREATE TABLE IF NOT EXISTS public.ledger_import_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'tally' CHECK (source_system IN ('tally','marg','csv','manual')),
  file_name TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','parsing','staging','reviewing','importing','completed','failed','rolled_back')),
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
CREATE POLICY ledger_import_sessions_view ON public.ledger_import_sessions FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY ledger_import_sessions_manage ON public.ledger_import_sessions FOR ALL USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid())) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));

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
CREATE POLICY staging_ledger_groups_view ON public.staging_ledger_groups FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY staging_ledger_groups_manage ON public.staging_ledger_groups FOR ALL USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid())) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));

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
CREATE INDEX IF NOT EXISTS idx_staging_ledgers_session ON public.staging_ledgers(session_id);
CREATE INDEX IF NOT EXISTS idx_staging_ledgers_status ON public.staging_ledgers(validation_status);
ALTER TABLE public.staging_ledgers ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_ledgers_view ON public.staging_ledgers FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY staging_ledgers_manage ON public.staging_ledgers FOR ALL USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid())) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND company_id = public.get_user_company_id(auth.uid()));

-- Functions & triggers
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
CREATE TRIGGER trg_ledger_group_path BEFORE INSERT OR UPDATE OF parent_id ON public.ledger_groups FOR EACH ROW EXECUTE FUNCTION public.update_ledger_group_path();

DROP TRIGGER IF EXISTS trg_ledger_groups_updated ON public.ledger_groups;
CREATE TRIGGER trg_ledger_groups_updated BEFORE UPDATE ON public.ledger_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ledgers_updated ON public.ledgers;
CREATE TRIGGER trg_ledgers_updated BEFORE UPDATE ON public.ledgers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ledger_balances_updated ON public.ledger_balances;
CREATE TRIGGER trg_ledger_balances_updated BEFORE UPDATE ON public.ledger_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ledger_import_sessions_updated ON public.ledger_import_sessions;
CREATE TRIGGER trg_ledger_import_sessions_updated BEFORE UPDATE ON public.ledger_import_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_ledger_group_descendants(p_group_id UUID)
RETURNS TABLE(id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT g.id FROM public.ledger_groups g
  WHERE g.materialized_path LIKE ((SELECT materialized_path FROM public.ledger_groups WHERE id = p_group_id) || '%')
  AND g.id != p_group_id;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.get_ledger_group_ancestors(p_group_id UUID)
RETURNS TABLE(id UUID) AS $$
DECLARE v_path TEXT;
BEGIN
  SELECT materialized_path INTO v_path FROM public.ledger_groups WHERE id = p_group_id;
  IF v_path IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT g.id FROM public.ledger_groups g
  WHERE v_path LIKE g.materialized_path || '%'
  AND g.id != p_group_id;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.create_ledger_roles_from_staging(p_ledger_id UUID, p_company_id UUID, p_role_types TEXT[])
RETURNS VOID AS $$
DECLARE v_role TEXT;
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
CREATE TRIGGER trg_ledgers_balance BEFORE INSERT OR UPDATE OF opening_balance ON public.ledgers FOR EACH ROW EXECUTE FUNCTION public.update_ledger_current_balance();

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

CREATE OR REPLACE VIEW public.ledgers_with_roles AS
SELECT
  l.*,
  COALESCE(array_agg(DISTINCT lr.role_type) FILTER (WHERE lr.role_type IS NOT NULL), ARRAY[]::public.ledger_role_type[]) as roles,
  COALESCE((SELECT lr2.role_type FROM public.ledger_roles lr2 WHERE lr2.ledger_id = l.id AND lr2.is_primary = true LIMIT 1), NULL) as primary_role
FROM public.ledgers l
LEFT JOIN public.ledger_roles lr ON lr.ledger_id = l.id
GROUP BY l.id;

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manufacturers TO authenticated;
GRANT ALL ON public.manufacturers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gst_tax_structures TO authenticated;
GRANT ALL ON public.gst_tax_structures TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_sessions TO authenticated;
GRANT ALL ON public.import_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staging_products TO authenticated;
GRANT ALL ON public.staging_products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staging_batches TO authenticated;
GRANT ALL ON public.staging_batches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staging_suppliers TO authenticated;
GRANT ALL ON public.staging_suppliers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_groups TO authenticated;
GRANT ALL ON public.ledger_groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledgers TO authenticated;
GRANT ALL ON public.ledgers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_roles TO authenticated;
GRANT ALL ON public.ledger_roles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_balances TO authenticated;
GRANT ALL ON public.ledger_balances TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_import_sessions TO authenticated;
GRANT ALL ON public.ledger_import_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staging_ledger_groups TO authenticated;
GRANT ALL ON public.staging_ledger_groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staging_ledgers TO authenticated;
GRANT ALL ON public.staging_ledgers TO service_role;
GRANT SELECT ON public.ledgers_with_roles TO authenticated;
GRANT SELECT ON public.ledgers_with_roles TO service_role;