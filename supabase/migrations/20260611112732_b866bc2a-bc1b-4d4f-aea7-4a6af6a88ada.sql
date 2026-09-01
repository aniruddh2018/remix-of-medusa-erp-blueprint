
-- Prescriptions header
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload','whatsapp','counter')),
  image_url text,
  ocr_text text,
  ai_raw jsonb,
  ai_confidence numeric,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','verified','rejected','ordered','fulfilled')),
  sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  notes text,
  rejection_reason text,
  uploaded_by uuid,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prescriptions_company_idx ON public.prescriptions(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS prescriptions_customer_idx ON public.prescriptions(customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prescriptions_company_select ON public.prescriptions;
CREATE POLICY "prescriptions_company_select" ON public.prescriptions
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS prescriptions_company_insert ON public.prescriptions;
CREATE POLICY "prescriptions_company_insert" ON public.prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS prescriptions_company_update ON public.prescriptions;
CREATE POLICY "prescriptions_company_update" ON public.prescriptions
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS prescriptions_company_delete ON public.prescriptions;
CREATE POLICY "prescriptions_company_delete" ON public.prescriptions
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE TRIGGER prescriptions_updated_at
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Prescription items (AI-extracted lines, editable by pharmacist)
CREATE TABLE IF NOT EXISTS public.prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ai_name text,
  ai_strength text,
  ai_dosage text,
  ai_duration text,
  qty numeric NOT NULL DEFAULT 1,
  confidence numeric,
  approved boolean NOT NULL DEFAULT false,
  remarks text,
  stock_available numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prescription_items_rx_idx ON public.prescription_items(prescription_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_items TO authenticated;
GRANT ALL ON public.prescription_items TO service_role;

ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prescription_items_company_all ON public.prescription_items;
CREATE POLICY "prescription_items_company_all" ON public.prescription_items
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE TRIGGER prescription_items_updated_at
  BEFORE UPDATE ON public.prescription_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link sales_orders -> prescription (optional)
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_orders_prescription_idx ON public.sales_orders(prescription_id);
