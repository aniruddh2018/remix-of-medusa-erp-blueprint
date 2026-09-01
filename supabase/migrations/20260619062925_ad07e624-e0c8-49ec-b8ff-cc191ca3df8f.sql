
-- 1. Status enum
DO $$ BEGIN
  CREATE TYPE public.quotation_status AS ENUM ('draft','sent','accepted','expired','converted','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  quotation_number text NOT NULL,
  quotation_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_till date,
  status public.quotation_status NOT NULL DEFAULT 'draft',

  customer_id uuid,
  customer_name text NOT NULL,
  customer_phone text,
  customer_address text,
  customer_gstin text,

  doctor_id uuid,
  doctor_name text,

  items jsonb NOT NULL DEFAULT '[]'::jsonb,

  subtotal numeric NOT NULL DEFAULT 0,
  gst_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  freight_charges numeric NOT NULL DEFAULT 0,
  handling_charges numeric NOT NULL DEFAULT 0,
  delivery_charges numeric NOT NULL DEFAULT 0,
  other_charges numeric NOT NULL DEFAULT 0,
  bill_discount_percent numeric NOT NULL DEFAULT 0,
  bill_discount_flat numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,

  notes text,
  terms text,

  converted_sale_id uuid,
  converted_at timestamptz,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, quotation_number)
);

CREATE INDEX IF NOT EXISTS idx_quotations_company ON public.quotations(company_id, quotation_date DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations(company_id, status);

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT ALL ON public.quotations TO service_role;

-- 4. RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotations_select ON public.quotations;
CREATE POLICY "quotations_select" ON public.quotations FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id IN (SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid())
  );

DROP POLICY IF EXISTS quotations_insert ON public.quotations;
CREATE POLICY "quotations_insert" ON public.quotations FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR company_id IN (SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid())
  );

DROP POLICY IF EXISTS quotations_update ON public.quotations;
CREATE POLICY "quotations_update" ON public.quotations FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id IN (SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR company_id IN (SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid())
  );

DROP POLICY IF EXISTS quotations_delete ON public.quotations;
CREATE POLICY "quotations_delete" ON public.quotations FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id IN (SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid())
  );

-- 5. updated_at trigger
CREATE TRIGGER quotations_set_updated_at
BEFORE UPDATE ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. quotation_prefix on invoice_settings
ALTER TABLE public.invoice_settings
  ADD COLUMN IF NOT EXISTS quotation_prefix text NOT NULL DEFAULT 'QT-';
