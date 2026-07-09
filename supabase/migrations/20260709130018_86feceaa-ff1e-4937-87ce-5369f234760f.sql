
-- ============================================================================
-- FY Architecture v2 — M1: Schema foundation
-- ============================================================================

-- 1. Extend fy_status enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'draft' AND enumtypid = 'public.fy_status'::regtype) THEN
    ALTER TYPE public.fy_status ADD VALUE 'draft' BEFORE 'active';
  END IF;
END $$;

-- 2. Extend financial_years
ALTER TABLE public.financial_years
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month SMALLINT NOT NULL DEFAULT 4;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month SMALLINT NOT NULL DEFAULT 4;

-- Extend legacy invoice number capture
ALTER TABLE public.sales_orders    ADD COLUMN IF NOT EXISTS legacy_invoice_number TEXT;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS legacy_invoice_number TEXT;

-- ============================================================================
-- Transaction-type enum
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.txn_type AS ENUM (
    'SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN',
    'PAYMENT','RECEIPT','JOURNAL','CREDIT_NOTE','DEBIT_NOTE',
    'STOCK_ADJUSTMENT','OPENING_BALANCE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.movement_type AS ENUM (
    'PURCHASE','SALE','SALE_RETURN','PURCHASE_RETURN',
    'OPENING_STOCK','STOCK_ADJUSTMENT','EXPIRY','DAMAGE',
    'TRANSFER_IN','TRANSFER_OUT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.import_row_status AS ENUM (
    'PENDING','VALIDATED','NEEDS_REVIEW','IMPORTED','FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fy_close_status AS ENUM (
    'PENDING','VALIDATING','PROCESSING','COMPLETED','FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- transactions — canonical accounting header
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_year_id UUID NOT NULL REFERENCES public.financial_years(id),
  transaction_type public.txn_type NOT NULL,
  transaction_date DATE NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  posting_status TEXT NOT NULL DEFAULT 'posted',
  source TEXT NOT NULL DEFAULT 'app',
  narration TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reference_type, reference_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "txn company access" ON public.transactions FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_txn_company_fy      ON public.transactions(company_id, financial_year_id);
CREATE INDEX IF NOT EXISTS idx_txn_company_fy_date ON public.transactions(company_id, financial_year_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_txn_ref             ON public.transactions(reference_type, reference_id);

-- ============================================================================
-- ledger_entries
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  financial_year_id UUID NOT NULL REFERENCES public.financial_years(id),
  ledger_account_id UUID NOT NULL,
  entry_date DATE NOT NULL,
  debit NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit NUMERIC(18,2) NOT NULL DEFAULT 0,
  narration TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (debit >= 0 AND credit >= 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_entries company access" ON public.ledger_entries FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_le_fy_account ON public.ledger_entries(financial_year_id, ledger_account_id);
CREATE INDEX IF NOT EXISTS idx_le_txn        ON public.ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_le_company_fy ON public.ledger_entries(company_id, financial_year_id);

-- ============================================================================
-- ledger_opening_balances
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ledger_opening_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_year_id UUID NOT NULL REFERENCES public.financial_years(id) ON DELETE CASCADE,
  ledger_account_id UUID NOT NULL,
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance_type TEXT NOT NULL CHECK (balance_type IN ('DR','CR')),
  source TEXT NOT NULL DEFAULT 'CARRY_FORWARD',
  source_financial_year_id UUID REFERENCES public.financial_years(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (financial_year_id, ledger_account_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_opening_balances TO authenticated;
GRANT ALL ON public.ledger_opening_balances TO service_role;
ALTER TABLE public.ledger_opening_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lob company access" ON public.ledger_opening_balances FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- ============================================================================
-- inventory_movements
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  financial_year_id UUID NOT NULL REFERENCES public.financial_years(id),
  product_id UUID NOT NULL,
  batch_id UUID,
  movement_date DATE NOT NULL,
  movement_type public.movement_type NOT NULL,
  quantity_in NUMERIC(18,3) NOT NULL DEFAULT 0,
  quantity_out NUMERIC(18,3) NOT NULL DEFAULT 0,
  rate NUMERIC(18,4) NOT NULL DEFAULT 0,
  narration TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im company access" ON public.inventory_movements FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_im_fy_product ON public.inventory_movements(financial_year_id, product_id);
CREATE INDEX IF NOT EXISTS idx_im_fy_batch   ON public.inventory_movements(financial_year_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_im_txn        ON public.inventory_movements(transaction_id);
CREATE INDEX IF NOT EXISTS idx_im_company_fy ON public.inventory_movements(company_id, financial_year_id);

-- ============================================================================
-- inventory_opening_balances
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_opening_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_year_id UUID NOT NULL REFERENCES public.financial_years(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  batch_id UUID,
  opening_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,
  opening_value NUMERIC(18,2) NOT NULL DEFAULT 0,
  source_financial_year_id UUID REFERENCES public.financial_years(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (financial_year_id, product_id, batch_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_opening_balances TO authenticated;
GRANT ALL ON public.inventory_opening_balances TO service_role;
ALTER TABLE public.inventory_opening_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iob company access" ON public.inventory_opening_balances FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- ============================================================================
-- document_sequences
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.document_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_year_id UUID NOT NULL REFERENCES public.financial_years(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  suffix TEXT NOT NULL DEFAULT '',
  current_number BIGINT NOT NULL DEFAULT 0,
  padding SMALLINT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (financial_year_id, document_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_sequences TO authenticated;
GRANT ALL ON public.document_sequences TO service_role;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docseq company access" ON public.document_sequences FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- Atomic sequence increment
CREATE OR REPLACE FUNCTION public.next_document_number(
  _company_id UUID, _fy_id UUID, _doc_type TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT; v_suffix TEXT; v_num BIGINT; v_pad SMALLINT;
BEGIN
  INSERT INTO public.document_sequences(company_id, financial_year_id, document_type)
    VALUES (_company_id, _fy_id, _doc_type)
    ON CONFLICT (financial_year_id, document_type) DO NOTHING;

  UPDATE public.document_sequences
     SET current_number = current_number + 1, updated_at = now()
   WHERE financial_year_id = _fy_id AND document_type = _doc_type
   RETURNING prefix, suffix, current_number, padding
    INTO v_prefix, v_suffix, v_num, v_pad;

  RETURN v_prefix || lpad(v_num::text, v_pad, '0') || v_suffix;
END $$;
GRANT EXECUTE ON FUNCTION public.next_document_number(UUID,UUID,TEXT) TO authenticated, service_role;

-- ============================================================================
-- import_sessions + import_rows
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.import_sessions (
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_sessions TO authenticated;
GRANT ALL ON public.import_sessions TO service_role;
ALTER TABLE public.import_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imp_sess company access" ON public.import_sessions FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_session_id UUID NOT NULL REFERENCES public.import_sessions(id) ON DELETE CASCADE,
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_rows TO authenticated;
GRANT ALL ON public.import_rows TO service_role;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imp_rows company access" ON public.import_rows FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_imp_rows_session ON public.import_rows(import_session_id);
CREATE INDEX IF NOT EXISTS idx_imp_rows_fy      ON public.import_rows(resolved_financial_year_id);

-- ============================================================================
-- financial_year_close_jobs
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.financial_year_close_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_financial_year_id UUID NOT NULL REFERENCES public.financial_years(id),
  target_financial_year_id UUID REFERENCES public.financial_years(id),
  status public.fy_close_status NOT NULL DEFAULT 'PENDING',
  validation_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  initiated_by UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_year_close_jobs TO authenticated;
GRANT ALL ON public.financial_year_close_jobs TO service_role;
ALTER TABLE public.financial_year_close_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fy_close company access" ON public.financial_year_close_jobs FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- ============================================================================
-- financial_year_unlocks
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.financial_year_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_year_id UUID NOT NULL REFERENCES public.financial_years(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  approved_by UUID NOT NULL,
  opened_by UUID,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_year_unlocks TO authenticated;
GRANT ALL ON public.financial_year_unlocks TO service_role;
ALTER TABLE public.financial_year_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fy_unlock read" ON public.financial_year_unlocks FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "fy_unlock write admin" ON public.financial_year_unlocks FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
    AND (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  );
CREATE POLICY "fy_unlock update admin" ON public.financial_year_unlocks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_fy_unlock_active ON public.financial_year_unlocks(financial_year_id, expires_at) WHERE revoked_at IS NULL;

-- ============================================================================
-- FY Resolver + Writable validator (SECURITY DEFINER helpers)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_financial_year(_company_id UUID, _tx_date DATE)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.financial_years
   WHERE company_id = _company_id
     AND _tx_date BETWEEN start_date AND end_date
   ORDER BY status = 'active' DESC
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_financial_year(UUID,DATE) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_financial_year_writable(_fy_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.fy_status; v_locked BOOLEAN;
BEGIN
  SELECT status, is_locked INTO v_status, v_locked FROM public.financial_years WHERE id = _fy_id;
  IF v_status IS NULL THEN RETURN FALSE; END IF;

  IF v_status IN ('active','draft') AND NOT v_locked THEN RETURN TRUE; END IF;

  -- Closed / archived / locked: allow admins with an active unlock window
  IF public.is_super_admin(_user_id) OR public.has_role(_user_id,'admin') THEN
    IF EXISTS (
      SELECT 1 FROM public.financial_year_unlocks
       WHERE financial_year_id = _fy_id
         AND revoked_at IS NULL
         AND expires_at > now()
    ) THEN RETURN TRUE; END IF;
  END IF;

  RETURN FALSE;
END $$;
GRANT EXECUTE ON FUNCTION public.is_financial_year_writable(UUID,UUID) TO authenticated, service_role;

-- updated_at trigger for document_sequences
DROP TRIGGER IF EXISTS trg_docseq_updated ON public.document_sequences;
CREATE TRIGGER trg_docseq_updated BEFORE UPDATE ON public.document_sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
