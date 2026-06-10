-- Phase 3: Real RAG Architecture — Separate product_embeddings table
-- Move embeddings off the products table into a dedicated embeddings store.
-- Enables independent scaling, model versioning, and async embedding generation.

-- ============================================================
-- 3.1: Create product_embeddings table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  embedding vector(768) NOT NULL,
  model TEXT NOT NULL DEFAULT 'nomic-ai/nomic-embed-text-v1.5',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);

-- HNSW index for fast ANN search (same config as old products.embedding index)
CREATE INDEX IF NOT EXISTS idx_product_embeddings_hnsw
  ON public.product_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index for company-scoped lookups
CREATE INDEX IF NOT EXISTS idx_product_embeddings_company
  ON public.product_embeddings (company_id);

-- ============================================================
-- 3.2: Migrate existing embeddings from products table
-- ============================================================
INSERT INTO public.product_embeddings (product_id, company_id, embedding, model)
SELECT
  p.id AS product_id,
  p.company_id,
  p.embedding,
  'nomic-ai/nomic-embed-text-v1.5'
FROM public.products p
WHERE p.embedding IS NOT NULL
  AND p.company_id IS NOT NULL
ON CONFLICT (product_id) DO UPDATE
SET embedding = EXCLUDED.embedding,
    generated_at = now();

-- ============================================================
-- 3.3: Add embedding tracking column to products
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS embedding_needs_update BOOLEAN NOT NULL DEFAULT false;

-- Mark products without embeddings as needing update
UPDATE public.products
SET embedding_needs_update = true
WHERE id NOT IN (SELECT product_id FROM public.product_embeddings);

-- ============================================================
-- 3.4: Trigger to flag products for re-embedding on name change
-- ============================================================
CREATE OR REPLACE FUNCTION public.flag_product_for_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.embedding_needs_update := true;
  ELSIF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
    NEW.embedding_needs_update := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_product_for_embedding ON public.products;
CREATE TRIGGER trg_flag_product_for_embedding
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.flag_product_for_embedding();

-- ============================================================
-- 3.5: RLS for product_embeddings — company-scoped access
-- ============================================================
ALTER TABLE public.product_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_embeddings_select" ON public.product_embeddings;
CREATE POLICY "product_embeddings_select"
  ON public.product_embeddings
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE user_id = auth.uid()
    )
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "product_embeddings_insert" ON public.product_embeddings;
CREATE POLICY "product_embeddings_insert"
  ON public.product_embeddings
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE user_id = auth.uid()
    )
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "product_embeddings_update" ON public.product_embeddings;
CREATE POLICY "product_embeddings_update"
  ON public.product_embeddings
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE user_id = auth.uid()
    )
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "product_embeddings_delete" ON public.product_embeddings;
CREATE POLICY "product_embeddings_delete"
  ON public.product_embeddings
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE user_id = auth.uid()
    )
    OR is_super_admin(auth.uid())
  );

-- ============================================================
-- 3.6: Service role bypass policy for edge functions
-- ============================================================
DROP POLICY IF EXISTS "product_embeddings_service_role" ON public.product_embeddings;
CREATE POLICY "product_embeddings_service_role"
  ON public.product_embeddings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 3.7: Update find_best_product_match to use product_embeddings
-- ============================================================
-- Replaces the Phase 2 version — now reads vectors from product_embeddings
-- instead of from products.embedding column.

CREATE OR REPLACE FUNCTION public.find_best_product_match(
  extracted_name TEXT,
  company_id UUID,
  supplier_id UUID DEFAULT NULL,
  query_embedding TEXT DEFAULT NULL
)
RETURNS TABLE(
  product_id UUID,
  product_name TEXT,
  confidence_score DECIMAL(5,2),
  matching_method TEXT
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  normalized_name TEXT;
  best_match RECORD;
  local_embedding vector(768);
  -- Parsed invoice product
  parsed_invoice JSONB;
  inv_strength_str TEXT;
  inv_form TEXT;
  -- Hybrid score
  hybrid_score DECIMAL(5,2);
  -- For semantic pass with deterministic filters
  sem_candidate RECORD;
  sem_score DECIMAL(5,2);
  sem_best_score DECIMAL(5,2) := 0;
  sem_best_id UUID;
  sem_best_name TEXT;
BEGIN
  -- Normalize the input
  normalized_name := normalize_product_text(extracted_name);

  -- Parse the extracted name into structured fields
  parsed_invoice := parse_product_text(extracted_name);
  inv_strength_str := parsed_invoice->>'strength_str';
  inv_form := parsed_invoice->>'form';

  -- Parse embedding string if provided
  IF query_embedding IS NOT NULL AND query_embedding <> '' THEN
    BEGIN
      local_embedding := query_embedding::vector(768);
    EXCEPTION WHEN OTHERS THEN
      local_embedding := NULL;
    END;
  END IF;

  -- 1. Try exact match first
  SELECT p.id AS product_id, p.name AS product_name, 100.0::DECIMAL(5,2) AS confidence_score, 'exact'::TEXT AS matching_method
  INTO best_match
  FROM products p
  WHERE p.company_id = find_best_product_match.company_id
    AND p.is_active = true
    AND lower(trim(p.name)) = lower(trim(extracted_name))
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method;
    RETURN;
  END IF;

  -- 2. Try alias match
  IF supplier_id IS NOT NULL THEN
    SELECT vpa.product_id AS product_id, p.name AS product_name, vpa.confidence_score AS confidence_score, 'alias'::TEXT AS matching_method
    INTO best_match
    FROM vendor_product_aliases vpa
    JOIN products p ON p.id = vpa.product_id
    WHERE vpa.supplier_id = find_best_product_match.supplier_id
      AND vpa.is_approved = true
      AND lower(vpa.vendor_product_name) = lower(extracted_name)
    LIMIT 1;

    IF FOUND THEN
      UPDATE vendor_product_aliases
      SET usage_count = usage_count + 1,
          last_used_at = now()
      WHERE supplier_id = find_best_product_match.supplier_id
        AND is_approved = true
        AND lower(vendor_product_name) = lower(extracted_name);

      RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method;
      RETURN;
    END IF;
  END IF;

  -- 3. Deterministic-filtered semantic match using product_embeddings table
  -- Filter by strength and form BEFORE vector similarity scan
  IF local_embedding IS NOT NULL THEN
    -- Try with full deterministic filter first (strength + form)
    FOR sem_candidate IN
      SELECT p.id, p.name, p.brand, p.strength, p.form,
             cosine_distance_to_confidence(pe.embedding <=> local_embedding) AS raw_similarity
      FROM products p
      JOIN product_embeddings pe ON pe.product_id = p.id
      WHERE p.company_id = find_best_product_match.company_id
        AND p.is_active = true
        -- Deterministic filters: strength and/or form must match if we have them
        AND (inv_strength_str IS NULL OR inv_strength_str = ''
             OR lower(trim(COALESCE(p.strength, ''))) = lower(trim(inv_strength_str)))
        AND (inv_form IS NULL OR inv_form = ''
             OR lower(trim(COALESCE(p.form, ''))) = lower(trim(inv_form)))
      ORDER BY pe.embedding <=> local_embedding ASC
      LIMIT 10
    LOOP
      -- Compute hybrid weighted score
      hybrid_score := compute_hybrid_match_score(
        parsed_invoice,
        jsonb_build_object(
          'product_id', sem_candidate.id,
          'product_name', sem_candidate.name,
          'brand', sem_candidate.brand,
          'strength', sem_candidate.strength,
          'form', sem_candidate.form
        ),
        (1.0 - (sem_candidate.raw_similarity / 100.0))
      );

      IF hybrid_score > sem_best_score THEN
        sem_best_score := hybrid_score;
        sem_best_id := sem_candidate.id;
        sem_best_name := sem_candidate.name;
      END IF;
    END LOOP;

    -- If no result with filters, fall back to unfiltered semantic search
    IF sem_best_id IS NULL THEN
      FOR sem_candidate IN
        SELECT p.id, p.name, p.brand, p.strength, p.form,
               cosine_distance_to_confidence(pe.embedding <=> local_embedding) AS raw_similarity
        FROM products p
        JOIN product_embeddings pe ON pe.product_id = p.id
        WHERE p.company_id = find_best_product_match.company_id
          AND p.is_active = true
        ORDER BY pe.embedding <=> local_embedding ASC
        LIMIT 10
      LOOP
        hybrid_score := compute_hybrid_match_score(
          parsed_invoice,
          jsonb_build_object(
            'product_id', sem_candidate.id,
            'product_name', sem_candidate.name,
            'brand', sem_candidate.brand,
            'strength', sem_candidate.strength,
            'form', sem_candidate.form
          ),
          (1.0 - (sem_candidate.raw_similarity / 100.0))
        );

        IF hybrid_score > sem_best_score THEN
          sem_best_score := hybrid_score;
          sem_best_id := sem_candidate.id;
          sem_best_name := sem_candidate.name;
        END IF;
      END LOOP;
    END IF;

    -- Return best semantic match if score is reasonable
    IF sem_best_id IS NOT NULL AND sem_best_score >= 50.0 THEN
      RETURN QUERY SELECT sem_best_id, sem_best_name, sem_best_score, 'semantic'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 4. Try fingerprint match (requires products to have populated fingerprint)
  SELECT p.id AS product_id, p.name AS product_name, 95.0::DECIMAL(5,2) AS confidence_score, 'fingerprint'::TEXT AS matching_method
  INTO best_match
  FROM products p
  WHERE p.company_id = find_best_product_match.company_id
    AND p.is_active = true
    AND p.fingerprint IS NOT NULL
    AND p.fingerprint = generate_product_fingerprint(
      parsed_invoice->>'brand',
      parsed_invoice->>'strength_str',
      parsed_invoice->>'form',
      parsed_invoice->>'pack_size'
    )
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method;
    RETURN;
  END IF;

  -- 5. Try fuzzy matching (fallback)
  SELECT p.id AS product_id, p.name AS product_name,
         text_similarity(normalized_name, normalize_product_text(p.name)) AS confidence_score,
         'fuzzy'::TEXT AS matching_method
  INTO best_match
  FROM products p
  WHERE p.company_id = find_best_product_match.company_id
    AND p.is_active = true
    AND text_similarity(normalized_name, normalize_product_text(p.name)) >= 75.0
  ORDER BY text_similarity(normalized_name, normalize_product_text(p.name)) DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method;
    RETURN;
  END IF;

  -- No match found
  RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 0.0::DECIMAL(5,2), 'none'::TEXT;
END;
$$;
