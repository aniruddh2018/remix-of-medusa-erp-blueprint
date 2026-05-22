-- Data Import System Tables
-- Phase 1.1: Core import engine tables with RLS

-- ============================================================================
-- 1. import_jobs: Tracks each import operation (audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  entity_type TEXT NOT NULL CHECK (entity_type IN ('product','supplier','customer','inventory_batch','purchase_order','sales_order','payment')),
  file_name TEXT,
  file_type TEXT CHECK (file_type IN ('csv','xlsx','json')),

  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','detecting','mapping','previewing','importing','completed','failed','rolled_back')),

  total_rows INTEGER DEFAULT 0,
  success_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,

  mapping_config JSONB DEFAULT '{}',
  validation_results JSONB DEFAULT '{}',
  error_log JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_jobs_view_own ON public.import_jobs
  FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY import_jobs_manage_own ON public.import_jobs
  FOR ALL
  USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
         AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
              AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY import_jobs_super_admin_all ON public.import_jobs
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE INDEX idx_import_jobs_company_id ON public.import_jobs(company_id);
CREATE INDEX idx_import_jobs_status ON public.import_jobs(status);
CREATE INDEX idx_import_jobs_entity_type ON public.import_jobs(entity_type);
CREATE INDEX idx_import_jobs_created_at ON public.import_jobs(created_at DESC);
CREATE INDEX idx_import_jobs_company_status ON public.import_jobs(company_id, status, created_at DESC);

-- ============================================================================
-- 2. import_mappings: Per-field mapping with confidence scoring
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.import_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.import_jobs(id) ON DELETE CASCADE,

  entity_type TEXT NOT NULL CHECK (entity_type IN ('product','supplier','customer','inventory_batch','purchase_order','sales_order','payment')),

  source_field TEXT NOT NULL,
  target_field TEXT NOT NULL,
  transformation TEXT,
  confidence REAL,
  is_ai_generated BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.import_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_mappings_view_own ON public.import_mappings
  FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY import_mappings_manage_own ON public.import_mappings
  FOR ALL
  USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
         AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
              AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY import_mappings_super_admin_all ON public.import_mappings
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE INDEX idx_import_mappings_job_id ON public.import_mappings(job_id);
CREATE INDEX idx_import_mappings_company_id ON public.import_mappings(company_id);
CREATE INDEX idx_import_mappings_entity_type ON public.import_mappings(entity_type);

-- ============================================================================
-- 3. import_templates: Reusable mapping templates (system + company)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.import_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE, -- NULL = system template

  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product','supplier','customer','inventory_batch','purchase_order','sales_order','payment')),
  source_system TEXT NOT NULL DEFAULT 'generic'
    CHECK (source_system IN ('generic','tally','sap','zoho','quickbooks','odoo','erpnext')),

  field_mappings JSONB NOT NULL DEFAULT '[]',
  transformations JSONB DEFAULT '{}',

  is_system BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.import_templates ENABLE ROW LEVEL SECURITY;

-- Anyone in a company can view system templates + their own company templates
CREATE POLICY import_templates_view ON public.import_templates
  FOR SELECT
  USING (is_system = true
         OR company_id = public.get_user_company_id(auth.uid())
         OR public.is_super_admin(auth.uid()));

CREATE POLICY import_templates_manage_own ON public.import_templates
  FOR ALL
  USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
         AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
              AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY import_templates_super_admin_system ON public.import_templates
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE INDEX idx_import_templates_company_id ON public.import_templates(company_id);
CREATE INDEX idx_import_templates_entity_type ON public.import_templates(entity_type);
CREATE INDEX idx_import_templates_source_system ON public.import_templates(source_system);
CREATE INDEX idx_import_templates_is_system ON public.import_templates(is_system);

-- ============================================================================
-- Auto-update trigger for updated_at columns
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_import_jobs_updated_at ON public.import_jobs;
CREATE TRIGGER update_import_jobs_updated_at
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_import_templates_updated_at ON public.import_templates;
CREATE TRIGGER update_import_templates_updated_at
  BEFORE UPDATE ON public.import_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
