-- Learned voice/text correction memory: when a user remaps a mis-matched
-- product (QuickTextEntry's remapProduct), the correction is remembered per
-- company so the same misheard/mistyped phrase resolves correctly next time
-- — checked before the exact/alias/vector pipeline in batch_match_products.
CREATE TABLE IF NOT EXISTS public.company_product_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  raw_phrase TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  hit_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, raw_phrase)
);

ALTER TABLE public.company_product_aliases ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.company_product_aliases TO service_role;

CREATE POLICY "company members can read their aliases"
  ON public.company_product_aliases FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "company members can write their aliases"
  ON public.company_product_aliases FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "company members can update their aliases"
  ON public.company_product_aliases FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
