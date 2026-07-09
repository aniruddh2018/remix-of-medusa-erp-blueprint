
-- Undo the wrong rename (my M1 CREATE TABLE IF NOT EXISTS silently no-op'd because
-- the migration-engine table already owned the name). Move them back.
ALTER TABLE public.fy_import_sessions RENAME TO import_sessions;
ALTER TABLE public.fy_import_rows RENAME TO import_rows;

-- Now create the FY-specific staging tables under new names.
CREATE TABLE public.fy_import_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  import_mode TEXT NOT NULL DEFAULT 'AUTO_DETECT_FY',
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  review_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fy_import_sessions TO authenticated;
GRANT ALL ON public.fy_import_sessions TO service_role;
ALTER TABLE public.fy_import_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fy_imp_sess company access" ON public.fy_import_sessions FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TABLE public.fy_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_session_id UUID NOT NULL REFERENCES public.fy_import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  source_row_number INTEGER,
  transaction_date DATE,
  resolved_financial_year_id UUID REFERENCES public.financial_years(id),
  status public.import_row_status NOT NULL DEFAULT 'PENDING',
  error_code TEXT,
  error_message TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fy_import_rows TO authenticated;
GRANT ALL ON public.fy_import_rows TO service_role;
ALTER TABLE public.fy_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fy_imp_rows company access" ON public.fy_import_rows FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE INDEX idx_fy_imp_rows_session ON public.fy_import_rows(import_session_id);
CREATE INDEX idx_fy_imp_rows_fy      ON public.fy_import_rows(resolved_financial_year_id);
