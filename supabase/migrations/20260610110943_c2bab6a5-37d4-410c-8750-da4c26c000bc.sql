-- Stub table required by chunk (created if missing)
CREATE TABLE IF NOT EXISTS public.supplier_invoice_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
  format_type TEXT NOT NULL DEFAULT 'pdf',
  column_mappings JSONB DEFAULT '{}'::jsonb,
  total_scanned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_invoice_formats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supplier_invoice_formats_all ON public.supplier_invoice_formats;
CREATE POLICY supplier_invoice_formats_all ON public.supplier_invoice_formats
  FOR ALL USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- ============================================================
-- Phase 3: product_embeddings table (RAG architecture)
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

CREATE INDEX IF NOT EXISTS idx_product_embeddings_hnsw
  ON public.product_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_product_embeddings_company
  ON public.product_embeddings (company_id);

INSERT INTO public.product_embeddings (product_id, company_id, embedding, model)
SELECT p.id, p.company_id, p.embedding, 'nomic-ai/nomic-embed-text-v1.5'
FROM public.products p
WHERE p.embedding IS NOT NULL AND p.company_id IS NOT NULL
ON CONFLICT (product_id) DO UPDATE
SET embedding = EXCLUDED.embedding, generated_at = now();

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS embedding_needs_update BOOLEAN NOT NULL DEFAULT false;

UPDATE public.products SET embedding_needs_update = true
WHERE id NOT IN (SELECT product_id FROM public.product_embeddings);

CREATE OR REPLACE FUNCTION public.flag_product_for_embedding()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
  FOR EACH ROW EXECUTE FUNCTION public.flag_product_for_embedding();

ALTER TABLE public.product_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_embeddings_select" ON public.product_embeddings;
CREATE POLICY "product_embeddings_select" ON public.product_embeddings FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()) OR is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "product_embeddings_insert" ON public.product_embeddings;
CREATE POLICY "product_embeddings_insert" ON public.product_embeddings FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()) OR is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "product_embeddings_update" ON public.product_embeddings;
CREATE POLICY "product_embeddings_update" ON public.product_embeddings FOR UPDATE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()) OR is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "product_embeddings_delete" ON public.product_embeddings;
CREATE POLICY "product_embeddings_delete" ON public.product_embeddings FOR DELETE
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()) OR is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "product_embeddings_service_role" ON public.product_embeddings;
CREATE POLICY "product_embeddings_service_role" ON public.product_embeddings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- Phase 3.7: find_best_product_match using product_embeddings
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_best_product_match(
  extracted_name TEXT, company_id UUID, supplier_id UUID DEFAULT NULL, query_embedding TEXT DEFAULT NULL
)
RETURNS TABLE(product_id UUID, product_name TEXT, confidence_score DECIMAL(5,2), matching_method TEXT)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  normalized_name TEXT;
  best_match RECORD;
  local_embedding vector(768);
  parsed_invoice JSONB;
  inv_strength_str TEXT;
  inv_form TEXT;
  hybrid_score DECIMAL(5,2);
  sem_candidate RECORD;
  sem_best_score DECIMAL(5,2) := 0;
  sem_best_id UUID;
  sem_best_name TEXT;
BEGIN
  normalized_name := normalize_product_text(extracted_name);
  parsed_invoice := parse_product_text(extracted_name);
  inv_strength_str := parsed_invoice->>'strength_str';
  inv_form := parsed_invoice->>'form';

  IF query_embedding IS NOT NULL AND query_embedding <> '' THEN
    BEGIN local_embedding := query_embedding::vector(768);
    EXCEPTION WHEN OTHERS THEN local_embedding := NULL; END;
  END IF;

  SELECT p.id, p.name, 100.0::DECIMAL(5,2), 'exact'::TEXT INTO best_match
  FROM products p WHERE p.company_id = find_best_product_match.company_id
    AND p.is_active = true AND lower(trim(p.name)) = lower(trim(extracted_name)) LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method;
    RETURN;
  END IF;

  IF supplier_id IS NOT NULL THEN
    SELECT vpa.product_id, p.name, vpa.confidence_score, 'alias'::TEXT INTO best_match
    FROM vendor_product_aliases vpa JOIN products p ON p.id = vpa.product_id
    WHERE vpa.supplier_id = find_best_product_match.supplier_id
      AND vpa.is_approved = true AND lower(vpa.vendor_product_name) = lower(extracted_name) LIMIT 1;
    IF FOUND THEN
      UPDATE vendor_product_aliases SET usage_count = usage_count + 1, last_used_at = now()
      WHERE supplier_id = find_best_product_match.supplier_id AND is_approved = true
        AND lower(vendor_product_name) = lower(extracted_name);
      RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method;
      RETURN;
    END IF;
  END IF;

  IF local_embedding IS NOT NULL THEN
    FOR sem_candidate IN
      SELECT p.id, p.name, p.brand, p.strength, p.form,
             cosine_distance_to_confidence(pe.embedding <=> local_embedding) AS raw_similarity
      FROM products p JOIN product_embeddings pe ON pe.product_id = p.id
      WHERE p.company_id = find_best_product_match.company_id AND p.is_active = true
        AND (inv_strength_str IS NULL OR inv_strength_str = '' OR lower(trim(COALESCE(p.strength, ''))) = lower(trim(inv_strength_str)))
        AND (inv_form IS NULL OR inv_form = '' OR lower(trim(COALESCE(p.form, ''))) = lower(trim(inv_form)))
      ORDER BY pe.embedding <=> local_embedding ASC LIMIT 10
    LOOP
      hybrid_score := compute_hybrid_match_score(parsed_invoice,
        jsonb_build_object('product_id', sem_candidate.id, 'product_name', sem_candidate.name,
          'brand', sem_candidate.brand, 'strength', sem_candidate.strength, 'form', sem_candidate.form),
        (1.0 - (sem_candidate.raw_similarity / 100.0)));
      IF hybrid_score > sem_best_score THEN
        sem_best_score := hybrid_score; sem_best_id := sem_candidate.id; sem_best_name := sem_candidate.name;
      END IF;
    END LOOP;

    IF sem_best_id IS NULL THEN
      FOR sem_candidate IN
        SELECT p.id, p.name, p.brand, p.strength, p.form,
               cosine_distance_to_confidence(pe.embedding <=> local_embedding) AS raw_similarity
        FROM products p JOIN product_embeddings pe ON pe.product_id = p.id
        WHERE p.company_id = find_best_product_match.company_id AND p.is_active = true
        ORDER BY pe.embedding <=> local_embedding ASC LIMIT 10
      LOOP
        hybrid_score := compute_hybrid_match_score(parsed_invoice,
          jsonb_build_object('product_id', sem_candidate.id, 'product_name', sem_candidate.name,
            'brand', sem_candidate.brand, 'strength', sem_candidate.strength, 'form', sem_candidate.form),
          (1.0 - (sem_candidate.raw_similarity / 100.0)));
        IF hybrid_score > sem_best_score THEN
          sem_best_score := hybrid_score; sem_best_id := sem_candidate.id; sem_best_name := sem_candidate.name;
        END IF;
      END LOOP;
    END IF;

    IF sem_best_id IS NOT NULL AND sem_best_score >= 50.0 THEN
      RETURN QUERY SELECT sem_best_id, sem_best_name, sem_best_score, 'semantic'::TEXT;
      RETURN;
    END IF;
  END IF;

  SELECT p.id, p.name, 95.0::DECIMAL(5,2), 'fingerprint'::TEXT INTO best_match
  FROM products p WHERE p.company_id = find_best_product_match.company_id AND p.is_active = true
    AND p.fingerprint IS NOT NULL
    AND p.fingerprint = generate_product_fingerprint(
      parsed_invoice->>'brand', parsed_invoice->>'strength_str',
      parsed_invoice->>'form', parsed_invoice->>'pack_size') LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method;
    RETURN;
  END IF;

  SELECT p.id, p.name,
         text_similarity(normalized_name, normalize_product_text(p.name)), 'fuzzy'::TEXT INTO best_match
  FROM products p WHERE p.company_id = find_best_product_match.company_id AND p.is_active = true
    AND text_similarity(normalized_name, normalize_product_text(p.name)) >= 75.0
  ORDER BY text_similarity(normalized_name, normalize_product_text(p.name)) DESC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 0.0::DECIMAL(5,2), 'none'::TEXT;
END;
$$;

-- ============================================================
-- Phase 5: Learning system - vendor_product_aliases enhancements
-- ============================================================
ALTER TABLE public.vendor_product_aliases
  ADD COLUMN IF NOT EXISTS approval_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS match_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_match_confidence DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS last_matched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS match_history JSONB DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.record_alias_match(
  _supplier_id UUID, _vendor_product_name TEXT, _confidence DECIMAL(5,2), _extracted_name TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _alias RECORD; _entry JSONB;
BEGIN
  SELECT * INTO _alias FROM vendor_product_aliases
  WHERE supplier_id = _supplier_id AND lower(vendor_product_name) = lower(_vendor_product_name);
  IF NOT FOUND THEN RETURN; END IF;
  _entry := jsonb_build_object('confidence', _confidence, 'matched_at', now(),
    'extracted_name', COALESCE(_extracted_name, _vendor_product_name));
  UPDATE vendor_product_aliases
  SET match_count = COALESCE(match_count, 0) + 1, last_match_confidence = _confidence,
      last_matched_at = now(), last_used_at = now(),
      match_history = CASE WHEN match_history IS NULL THEN jsonb_build_array(_entry) ELSE (match_history || _entry) END,
      is_approved = CASE WHEN is_approved = false AND COALESCE(match_count, 0) + 1 >= 3 AND _confidence >= 95 THEN true ELSE is_approved END,
      approval_history = CASE WHEN is_approved = false AND COALESCE(match_count, 0) + 1 >= 3 AND _confidence >= 95
        THEN approval_history || jsonb_build_object('action', 'auto_approved', 'by_system', true, 'timestamp', now(), 'reason', '3+ matches at confidence >= 95')
        ELSE approval_history END
  WHERE id = _alias.id;
END; $$;

CREATE OR REPLACE FUNCTION public.review_alias(
  _alias_id UUID, _approved BOOLEAN, _reviewed_by UUID, _notes TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE vendor_product_aliases SET is_approved = _approved,
    approved_by = CASE WHEN _approved THEN _reviewed_by ELSE approved_by END,
    approval_history = approval_history || jsonb_build_object(
      'action', CASE WHEN _approved THEN 'approved' ELSE 'rejected' END,
      'by_user_id', _reviewed_by, 'timestamp', now(), 'notes', _notes)
  WHERE id = _alias_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_alias_reliability(_supplier_id UUID)
RETURNS DECIMAL(5,2) LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  total_aliases INTEGER; approved_aliases INTEGER; total_matches INTEGER; avg_confidence DECIMAL(5,2);
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_approved = true), SUM(match_count), AVG(last_match_confidence)
  INTO total_aliases, approved_aliases, total_matches, avg_confidence
  FROM vendor_product_aliases WHERE supplier_id = _supplier_id;
  IF total_aliases = 0 THEN RETURN 0; END IF;
  RETURN ROUND(
    (COALESCE(approved_aliases, 0)::DECIMAL / NULLIF(total_aliases, 0) * 40) +
    (LEAST(COALESCE(total_matches, 0)::DECIMAL / NULLIF(total_aliases, 0), 10) / 10 * 30) +
    (COALESCE(avg_confidence, 0) / 100 * 30), 2);
END; $$;

-- ============================================================
-- Phase 5.2: supplier_invoice_formats enhancements
-- ============================================================
ALTER TABLE public.supplier_invoice_formats
  ADD COLUMN IF NOT EXISTS column_coordinates JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS row_detection_pattern TEXT,
  ADD COLUMN IF NOT EXISTS learned_offsets JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS template_version INTEGER DEFAULT 1;

CREATE OR REPLACE FUNCTION public.learn_column_mapping(
  _supplier_id UUID, _format_type TEXT, _field_name TEXT, _detected_column TEXT, _confidence INTEGER DEFAULT 100
) RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _format RECORD; _mappings JSONB;
BEGIN
  SELECT * INTO _format FROM supplier_invoice_formats
  WHERE supplier_id = _supplier_id AND format_type = _format_type
  ORDER BY total_scanned DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  _mappings := COALESCE(_format.column_mappings, '{}'::jsonb);
  IF _mappings ? _field_name THEN
    IF _mappings->_field_name ? _detected_column THEN
      _mappings := jsonb_set(_mappings, ARRAY[_field_name, _detected_column],
        to_jsonb(((_mappings->_field_name->>_detected_column)::INTEGER + 1)));
    ELSE
      _mappings := jsonb_set(_mappings, ARRAY[_field_name, _detected_column], '1'::jsonb);
    END IF;
  ELSE
    _mappings := jsonb_set(_mappings, ARRAY[_field_name], jsonb_build_object(_detected_column, 1));
  END IF;
  UPDATE supplier_invoice_formats SET column_mappings = _mappings,
    template_version = COALESCE(template_version, 1) + 1, updated_at = now()
  WHERE id = _format.id;
END; $$;

CREATE OR REPLACE FUNCTION public.suggest_column_mappings(_supplier_id UUID, _format_type TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE result JSONB := '{}'::jsonb; fmt RECORD; field_name TEXT; col_name TEXT; max_count INTEGER;
BEGIN
  FOR fmt IN SELECT column_mappings FROM supplier_invoice_formats
    WHERE supplier_id = _supplier_id AND (_format_type IS NULL OR format_type = _format_type)
    ORDER BY total_scanned DESC LIMIT 5
  LOOP
    IF fmt.column_mappings IS NULL THEN CONTINUE; END IF;
    FOR field_name IN SELECT jsonb_object_keys(fmt.column_mappings) LOOP
      IF result ? field_name THEN CONTINUE; END IF;
      SELECT k, (v::text)::INTEGER INTO col_name, max_count
      FROM jsonb_each_text(fmt.column_mappings->field_name) AS t(k, v)
      ORDER BY (v::text)::INTEGER DESC LIMIT 1;
      IF col_name IS NOT NULL AND max_count > 0 THEN
        result := jsonb_set(result, ARRAY[field_name], to_jsonb(col_name));
      END IF;
    END LOOP;
  END LOOP;
  RETURN result;
END; $$;

UPDATE public.vendor_product_aliases SET approval_history = '[]'::jsonb WHERE approval_history IS NULL;
UPDATE public.vendor_product_aliases SET match_history = '[]'::jsonb WHERE match_history IS NULL;
UPDATE public.vendor_product_aliases SET match_count = COALESCE(usage_count, 0) WHERE match_count IS NULL OR match_count = 0;

-- ============================================================
-- Phase 6.1: Batch matching function
-- ============================================================
CREATE OR REPLACE FUNCTION public.batch_match_products(
  _line_items JSONB, _company_id UUID, _supplier_id UUID DEFAULT NULL, _embeddings JSONB DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  item JSONB; result_item JSONB; results JSONB := '[]'::jsonb;
  embedding_str TEXT; parsed_invoice JSONB; inv_strength_str TEXT; inv_form TEXT;
  sem_candidate RECORD; hybrid_score DECIMAL(5,2);
  sem_best_score DECIMAL(5,2); sem_best_id UUID; sem_best_name TEXT;
  best_match RECORD; normalized_name TEXT; local_embedding vector(768);
  SEMANTIC_CAP CONSTANT DECIMAL(5,2) := 85;
  FINGERPRINT_CAP CONSTANT DECIMAL(5,2) := 90;
  FUZZY_CAP CONSTANT DECIMAL(5,2) := 85;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(_line_items) LOOP
    result_item := item;
    parsed_invoice := parse_product_text(item->>'product_name');
    normalized_name := normalize_product_text(item->>'product_name');
    local_embedding := NULL;
    IF _embeddings IS NOT NULL AND _embeddings ? (item->>'product_name') THEN
      embedding_str := _embeddings->>(item->>'product_name');
      IF embedding_str IS NOT NULL AND embedding_str <> '' THEN
        BEGIN local_embedding := embedding_str::vector(768);
        EXCEPTION WHEN OTHERS THEN local_embedding := NULL; END;
      END IF;
    END IF;

    SELECT p.id AS product_id, p.name AS product_name INTO best_match
    FROM products p WHERE p.company_id = _company_id AND p.is_active = true
      AND lower(trim(p.name)) = lower(trim(item->>'product_name')) LIMIT 1;
    IF FOUND THEN
      result_item := result_item || jsonb_build_object(
        'matched_product_id', best_match.product_id, 'matched_product_name', best_match.product_name,
        'matching_confidence', 100, 'matching_method', 'exact', 'needs_review', false,
        'matching_details', jsonb_build_object('method', 'exact', 'confidence', 100, 'auto_accepted', true));
      results := results || result_item; CONTINUE;
    END IF;

    IF _supplier_id IS NOT NULL THEN
      SELECT vpa.product_id, p.name AS product_name, vpa.confidence_score INTO best_match
      FROM vendor_product_aliases vpa JOIN products p ON p.id = vpa.product_id
      WHERE vpa.supplier_id = _supplier_id AND vpa.is_approved = true
        AND lower(vpa.vendor_product_name) = lower(item->>'product_name') LIMIT 1;
      IF FOUND THEN
        UPDATE vendor_product_aliases SET usage_count = usage_count + 1, last_used_at = now()
        WHERE supplier_id = _supplier_id AND is_approved = true
          AND lower(vendor_product_name) = lower(item->>'product_name');
        result_item := result_item || jsonb_build_object(
          'matched_product_id', best_match.product_id, 'matched_product_name', best_match.product_name,
          'matching_confidence', best_match.confidence_score, 'matching_method', 'alias', 'needs_review', false,
          'matching_details', jsonb_build_object('method', 'alias', 'confidence', best_match.confidence_score, 'auto_accepted', true));
        results := results || result_item; CONTINUE;
      END IF;
    END IF;

    sem_best_score := 0; sem_best_id := NULL; sem_best_name := NULL;
    IF local_embedding IS NOT NULL THEN
      inv_strength_str := parsed_invoice->>'strength_str';
      inv_form := parsed_invoice->>'form';
      FOR sem_candidate IN
        SELECT p.id, p.name, p.brand, p.strength, p.form,
               cosine_distance_to_confidence(pe.embedding <=> local_embedding) AS raw_similarity
        FROM products p JOIN product_embeddings pe ON pe.product_id = p.id
        WHERE p.company_id = _company_id AND p.is_active = true
          AND (inv_strength_str IS NULL OR inv_strength_str = '' OR lower(trim(COALESCE(p.strength, ''))) = lower(trim(inv_strength_str)))
          AND (inv_form IS NULL OR inv_form = '' OR lower(trim(COALESCE(p.form, ''))) = lower(trim(inv_form)))
        ORDER BY pe.embedding <=> local_embedding ASC LIMIT 10
      LOOP
        hybrid_score := compute_hybrid_match_score(parsed_invoice,
          jsonb_build_object('product_id', sem_candidate.id, 'product_name', sem_candidate.name,
            'brand', sem_candidate.brand, 'strength', sem_candidate.strength, 'form', sem_candidate.form),
          (1.0 - (sem_candidate.raw_similarity / 100.0)));
        IF hybrid_score > sem_best_score THEN
          sem_best_score := hybrid_score; sem_best_id := sem_candidate.id; sem_best_name := sem_candidate.name;
        END IF;
      END LOOP;

      IF sem_best_id IS NULL THEN
        FOR sem_candidate IN
          SELECT p.id, p.name, p.brand, p.strength, p.form,
                 cosine_distance_to_confidence(pe.embedding <=> local_embedding) AS raw_similarity
          FROM products p JOIN product_embeddings pe ON pe.product_id = p.id
          WHERE p.company_id = _company_id AND p.is_active = true
          ORDER BY pe.embedding <=> local_embedding ASC LIMIT 10
        LOOP
          hybrid_score := compute_hybrid_match_score(parsed_invoice,
            jsonb_build_object('product_id', sem_candidate.id, 'product_name', sem_candidate.name,
              'brand', sem_candidate.brand, 'strength', sem_candidate.strength, 'form', sem_candidate.form),
            (1.0 - (sem_candidate.raw_similarity / 100.0)));
          IF hybrid_score > sem_best_score THEN
            sem_best_score := hybrid_score; sem_best_id := sem_candidate.id; sem_best_name := sem_candidate.name;
          END IF;
        END LOOP;
      END IF;

      IF sem_best_id IS NOT NULL AND sem_best_score >= 50.0 THEN
        result_item := result_item || jsonb_build_object(
          'matched_product_id', sem_best_id, 'matched_product_name', sem_best_name,
          'matching_confidence', LEAST(sem_best_score, SEMANTIC_CAP), 'matching_method', 'semantic', 'needs_review', true,
          'matching_details', jsonb_build_object('method', 'semantic', 'raw_confidence', sem_best_score,
            'capped_confidence', LEAST(sem_best_score, SEMANTIC_CAP), 'auto_accepted', false));
        results := results || result_item; CONTINUE;
      END IF;
    END IF;

    SELECT p.id AS product_id, p.name AS product_name INTO best_match
    FROM products p WHERE p.company_id = _company_id AND p.is_active = true
      AND p.fingerprint IS NOT NULL
      AND p.fingerprint = generate_product_fingerprint(
        parsed_invoice->>'brand', parsed_invoice->>'strength_str',
        parsed_invoice->>'form', parsed_invoice->>'pack_size') LIMIT 1;
    IF FOUND THEN
      result_item := result_item || jsonb_build_object(
        'matched_product_id', best_match.product_id, 'matched_product_name', best_match.product_name,
        'matching_confidence', FINGERPRINT_CAP, 'matching_method', 'fingerprint', 'needs_review', true,
        'matching_details', jsonb_build_object('method', 'fingerprint', 'raw_confidence', 95,
          'capped_confidence', FINGERPRINT_CAP, 'auto_accepted', false));
      results := results || result_item; CONTINUE;
    END IF;

    SELECT p.id AS product_id, p.name AS product_name,
           text_similarity(normalized_name, normalize_product_text(p.name)) AS confidence_score INTO best_match
    FROM products p WHERE p.company_id = _company_id AND p.is_active = true
      AND text_similarity(normalized_name, normalize_product_text(p.name)) >= 75.0
    ORDER BY text_similarity(normalized_name, normalize_product_text(p.name)) DESC LIMIT 1;
    IF FOUND THEN
      result_item := result_item || jsonb_build_object(
        'matched_product_id', best_match.product_id, 'matched_product_name', best_match.product_name,
        'matching_confidence', LEAST(best_match.confidence_score, FUZZY_CAP),
        'matching_method', 'fuzzy', 'needs_review', true,
        'matching_details', jsonb_build_object('method', 'fuzzy', 'raw_confidence', best_match.confidence_score,
          'capped_confidence', LEAST(best_match.confidence_score, FUZZY_CAP), 'auto_accepted', false));
      results := results || result_item; CONTINUE;
    END IF;

    result_item := result_item || jsonb_build_object(
      'matching_method', 'none', 'matching_confidence', 0, 'needs_review', true,
      'matching_details', jsonb_build_object('method', 'none', 'confidence', 0, 'auto_accepted', false));
    results := results || result_item;
  END LOOP;
  RETURN results;
END; $$;

-- ============================================================
-- Phase 6.2: invoice_scan_queue
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoice_scan_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  file_paths TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  priority INTEGER DEFAULT 0,
  result JSONB,
  error_message TEXT,
  stage TEXT,
  stage_progress INTEGER DEFAULT 0,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3
);
CREATE INDEX IF NOT EXISTS idx_invoice_scan_queue_status ON public.invoice_scan_queue(status, priority DESC, queued_at ASC);
CREATE INDEX IF NOT EXISTS idx_invoice_scan_queue_company ON public.invoice_scan_queue(company_id);
ALTER TABLE public.invoice_scan_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoice_scan_queue_select" ON public.invoice_scan_queue;
CREATE POLICY "invoice_scan_queue_select" ON public.invoice_scan_queue FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()) OR is_super_admin(auth.uid()));
DROP POLICY IF EXISTS "invoice_scan_queue_insert" ON public.invoice_scan_queue;
CREATE POLICY "invoice_scan_queue_insert" ON public.invoice_scan_queue FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "invoice_scan_queue_service_role" ON public.invoice_scan_queue;
CREATE POLICY "invoice_scan_queue_service_role" ON public.invoice_scan_queue FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.claim_next_scan_job()
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE job RECORD;
BEGIN
  SELECT * INTO job FROM invoice_scan_queue
  WHERE status = 'queued' AND retry_count < max_retries
  ORDER BY priority DESC, queued_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN '{"claimed": false}'::jsonb; END IF;
  UPDATE invoice_scan_queue SET status = 'processing', started_at = now() WHERE id = job.id;
  RETURN jsonb_build_object('claimed', true, 'id', job.id, 'company_id', job.company_id,
    'user_id', job.user_id, 'file_paths', job.file_paths);
END; $$;

CREATE OR REPLACE FUNCTION public.update_scan_job(
  _job_id UUID, _status TEXT, _result JSONB DEFAULT NULL, _error TEXT DEFAULT NULL,
  _stage TEXT DEFAULT NULL, _stage_progress INTEGER DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE invoice_scan_queue SET status = _status,
    result = COALESCE(_result, result), error_message = COALESCE(_error, error_message),
    stage = COALESCE(_stage, stage), stage_progress = COALESCE(_stage_progress, stage_progress),
    completed_at = CASE WHEN _status IN ('completed', 'failed') THEN now() ELSE completed_at END
  WHERE id = _job_id;
END; $$;

CREATE OR REPLACE FUNCTION public.retry_failed_scans(_company_id UUID DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE retried_count INTEGER;
BEGIN
  UPDATE invoice_scan_queue SET status = 'queued', retry_count = retry_count + 1,
    error_message = NULL, started_at = NULL, completed_at = NULL
  WHERE status = 'failed' AND retry_count < max_retries
    AND (_company_id IS NULL OR company_id = _company_id);
  GET DIAGNOSTICS retried_count = ROW_COUNT;
  RETURN retried_count;
END; $$;

-- ============================================================
-- Import system tables
-- ============================================================
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
DROP POLICY IF EXISTS import_jobs_view_own ON public.import_jobs;
CREATE POLICY import_jobs_view_own ON public.import_jobs FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS import_jobs_manage_own ON public.import_jobs;
CREATE POLICY import_jobs_manage_own ON public.import_jobs FOR ALL
  USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
         AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
              AND company_id = public.get_user_company_id(auth.uid()));
DROP POLICY IF EXISTS import_jobs_super_admin_all ON public.import_jobs;
CREATE POLICY import_jobs_super_admin_all ON public.import_jobs FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_import_jobs_company_id ON public.import_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON public.import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_entity_type ON public.import_jobs(entity_type);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON public.import_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_jobs_company_status ON public.import_jobs(company_id, status, created_at DESC);

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
DROP POLICY IF EXISTS import_mappings_view_own ON public.import_mappings;
CREATE POLICY import_mappings_view_own ON public.import_mappings FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS import_mappings_manage_own ON public.import_mappings;
CREATE POLICY import_mappings_manage_own ON public.import_mappings FOR ALL
  USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
         AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
              AND company_id = public.get_user_company_id(auth.uid()));
DROP POLICY IF EXISTS import_mappings_super_admin_all ON public.import_mappings;
CREATE POLICY import_mappings_super_admin_all ON public.import_mappings FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_import_mappings_job_id ON public.import_mappings(job_id);
CREATE INDEX IF NOT EXISTS idx_import_mappings_company_id ON public.import_mappings(company_id);
CREATE INDEX IF NOT EXISTS idx_import_mappings_entity_type ON public.import_mappings(entity_type);

CREATE TABLE IF NOT EXISTS public.import_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
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
DROP POLICY IF EXISTS import_templates_view ON public.import_templates;
CREATE POLICY import_templates_view ON public.import_templates FOR SELECT
  USING (is_system = true OR company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS import_templates_manage_own ON public.import_templates;
CREATE POLICY import_templates_manage_own ON public.import_templates FOR ALL
  USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
         AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
              AND company_id = public.get_user_company_id(auth.uid()));
DROP POLICY IF EXISTS import_templates_super_admin_system ON public.import_templates;
CREATE POLICY import_templates_super_admin_system ON public.import_templates FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_import_templates_company_id ON public.import_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_import_templates_entity_type ON public.import_templates(entity_type);
CREATE INDEX IF NOT EXISTS idx_import_templates_source_system ON public.import_templates(source_system);
CREATE INDEX IF NOT EXISTS idx_import_templates_is_system ON public.import_templates(is_system);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_import_jobs_updated_at ON public.import_jobs;
CREATE TRIGGER update_import_jobs_updated_at BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_import_templates_updated_at ON public.import_templates;
CREATE TRIGGER update_import_templates_updated_at BEFORE UPDATE ON public.import_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- GRANTs for all new public tables
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_embeddings TO authenticated;
GRANT ALL ON public.product_embeddings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_scan_queue TO authenticated;
GRANT ALL ON public.invoice_scan_queue TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_mappings TO authenticated;
GRANT ALL ON public.import_mappings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_templates TO authenticated;
GRANT ALL ON public.import_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoice_formats TO authenticated;
GRANT ALL ON public.supplier_invoice_formats TO service_role;