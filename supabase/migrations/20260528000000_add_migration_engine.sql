-- Pharma ERP Migration Engine: Staging, Accounting Masters, Manufacturers
-- Supports: Marg XML, Tally XML migration with staging + confirm workflow

-- ============================================================================
-- 1. manufacturers: Normalized manufacturer master (currently TEXT on products)
-- ============================================================================
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

CREATE POLICY manufacturers_view_own ON public.manufacturers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY manufacturers_manage_own ON public.manufacturers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_manufacturers_company_id ON public.manufacturers(company_id);
CREATE INDEX idx_manufacturers_name ON public.manufacturers(company_id, name);

-- ============================================================================
-- 2. ledger_groups: Accounting group hierarchy (from Tally/Marg GROUP elements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ledger_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.ledger_groups(id) ON DELETE SET NULL,
  affects_stock BOOLEAN NOT NULL DEFAULT false,
  reserved_name TEXT,
  source_system TEXT DEFAULT 'manual' CHECK (source_system IN ('manual','tally','marg','imported')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE public.ledger_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_groups_view_own ON public.ledger_groups
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_groups_manage_own ON public.ledger_groups
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_ledger_groups_company_id ON public.ledger_groups(company_id);
CREATE INDEX idx_ledger_groups_parent_id ON public.ledger_groups(parent_id);
CREATE INDEX idx_ledger_groups_name ON public.ledger_groups(company_id, name);

-- ============================================================================
-- 3. ledgers: Accounting ledgers (suppliers, customers, GST, bank, cash, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  group_id UUID REFERENCES public.ledger_groups(id) ON DELETE SET NULL,
  ledger_type TEXT NOT NULL DEFAULT 'general' CHECK (ledger_type IN (
    'general','supplier','customer','bank','cash','gst','tax','expense','income','asset','liability'
  )),
  gst_number TEXT,
  pan_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  state TEXT,
  opening_balance NUMERIC(18,6) DEFAULT 0,
  balance_type TEXT DEFAULT 'debit' CHECK (balance_type IN ('debit','credit')),
  source_system TEXT DEFAULT 'manual' CHECK (source_system IN ('manual','tally','marg','imported')),
  source_ledger_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledgers_view_own ON public.ledgers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledgers_manage_own ON public.ledgers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_ledgers_company_id ON public.ledgers(company_id);
CREATE INDEX idx_ledgers_group_id ON public.ledgers(group_id);
CREATE INDEX idx_ledgers_type ON public.ledgers(company_id, ledger_type);
CREATE INDEX idx_ledgers_name ON public.ledgers(company_id, name);

-- ============================================================================
-- 4. gst_tax_structures: GST rate mapping from legacy tax structures
-- ============================================================================
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

CREATE POLICY gst_tax_structures_view_own ON public.gst_tax_structures
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY gst_tax_structures_manage_own ON public.gst_tax_structures
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_gst_tax_structures_company_id ON public.gst_tax_structures(company_id);
CREATE INDEX idx_gst_tax_structures_hsn ON public.gst_tax_structures(company_id, hsn_code);

-- ============================================================================
-- 5. import_sessions: Groups multiple import_jobs into a single migration session
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.import_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Migration',
  source_system TEXT NOT NULL DEFAULT 'tally' CHECK (source_system IN ('tally','marg','csv','manual')),
  file_name TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN (
    'uploaded','parsing','staging','reviewing','importing','completed','failed','rolled_back'
  )),
  parse_summary JSONB DEFAULT '{}',
  staging_summary JSONB DEFAULT '{}',
  import_summary JSONB DEFAULT '{}',
  error_log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.import_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_sessions_view_own ON public.import_sessions
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY import_sessions_manage_own ON public.import_sessions
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_import_sessions_company_id ON public.import_sessions(company_id);
CREATE INDEX idx_import_sessions_status ON public.import_sessions(status);
CREATE INDEX idx_import_sessions_created_at ON public.import_sessions(created_at DESC);

-- ============================================================================
-- 6. staging_products: Staging table for product imports
-- ============================================================================
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

CREATE POLICY staging_products_view_own ON public.staging_products
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY staging_products_manage_own ON public.staging_products
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_staging_products_session ON public.staging_products(session_id);
CREATE INDEX idx_staging_products_company ON public.staging_products(company_id);
CREATE INDEX idx_staging_products_status ON public.staging_products(validation_status);

-- ============================================================================
-- 7. staging_ledgers: Staging table for ledger imports (suppliers, customers, GST)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staging_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  parent_group_name TEXT,
  ledger_type TEXT DEFAULT 'general' CHECK (ledger_type IN (
    'general','supplier','customer','bank','cash','gst','tax','expense','income','asset','liability','skip'
  )),
  gst_number TEXT,
  pan_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  state TEXT,
  opening_balance NUMERIC(18,6) DEFAULT 0,
  balance_type TEXT DEFAULT 'debit' CHECK (balance_type IN ('debit','credit')),
  source_data JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','warning','imported','skipped')),
  validation_errors JSONB DEFAULT '[]',
  mapped_group_id UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staging_ledgers ENABLE ROW LEVEL SECURITY;

CREATE POLICY staging_ledgers_view_own ON public.staging_ledgers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY staging_ledgers_manage_own ON public.staging_ledgers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_staging_ledgers_session ON public.staging_ledgers(session_id);
CREATE INDEX idx_staging_ledgers_company ON public.staging_ledgers(company_id);
CREATE INDEX idx_staging_ledgers_type ON public.staging_ledgers(company_id, ledger_type);
CREATE INDEX idx_staging_ledgers_status ON public.staging_ledgers(validation_status);

-- ============================================================================
-- 8. staging_batches: Staging table for batch/stock imports
-- ============================================================================
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

CREATE POLICY staging_batches_view_own ON public.staging_batches
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY staging_batches_manage_own ON public.staging_batches
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_staging_batches_session ON public.staging_batches(session_id);
CREATE INDEX idx_staging_batches_company ON public.staging_batches(company_id);
CREATE INDEX idx_staging_batches_status ON public.staging_batches(validation_status);

-- ============================================================================
-- 9. staging_suppliers: Staging table for supplier/distributor imports
-- ============================================================================
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

CREATE POLICY staging_suppliers_view_own ON public.staging_suppliers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY staging_suppliers_manage_own ON public.staging_suppliers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_staging_suppliers_session ON public.staging_suppliers(session_id);
CREATE INDEX idx_staging_suppliers_company ON public.staging_suppliers(company_id);
CREATE INDEX idx_staging_suppliers_status ON public.staging_suppliers(validation_status);

-- ============================================================================
-- 10. Extend import_jobs: Add session_id + staging entity types
-- ============================================================================
ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_entity_type_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_entity_type_check
  CHECK (entity_type IN (
    'product','supplier','customer','inventory_batch','purchase_order','sales_order','payment',
    'ledger_group','ledger','manufacturer','gst_structure'
  ));

ALTER TABLE public.import_jobs ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.import_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_import_jobs_session_id ON public.import_jobs(session_id);

-- Extend import_templates entity types too
ALTER TABLE public.import_templates DROP CONSTRAINT IF EXISTS import_templates_entity_type_check;
ALTER TABLE public.import_templates ADD CONSTRAINT import_templates_entity_type_check
  CHECK (entity_type IN (
    'product','supplier','customer','inventory_batch','purchase_order','sales_order','payment',
    'ledger_group','ledger','manufacturer','gst_structure'
  ));

-- Extend import_mappings entity types
ALTER TABLE public.import_mappings DROP CONSTRAINT IF EXISTS import_mappings_entity_type_check;
ALTER TABLE public.import_mappings ADD CONSTRAINT import_mappings_entity_type_check
  CHECK (entity_type IN (
    'product','supplier','customer','inventory_batch','purchase_order','sales_order','payment',
    'ledger_group','ledger','manufacturer','gst_structure'
  ));

-- ============================================================================
-- 11. Add manufacturer FK to products (optional, nullable for backward compat)
-- ============================================================================
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturer_id UUID REFERENCES public.manufacturers(id);

-- ============================================================================
-- 12. Triggers for updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS update_manufacturers_updated_at ON public.manufacturers;
CREATE TRIGGER update_manufacturers_updated_at
  BEFORE UPDATE ON public.manufacturers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ledger_groups_updated_at ON public.ledger_groups;
CREATE TRIGGER update_ledger_groups_updated_at
  BEFORE UPDATE ON public.ledger_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ledgers_updated_at ON public.ledgers;
CREATE TRIGGER update_ledgers_updated_at
  BEFORE UPDATE ON public.ledgers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_import_sessions_updated_at ON public.import_sessions;
CREATE TRIGGER update_import_sessions_updated_at
  BEFORE UPDATE ON public.import_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
