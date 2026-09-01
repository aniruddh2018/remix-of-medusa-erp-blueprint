-- Switch product embeddings from Gemini (768-dim, via the old Lovable AI
-- gateway) to Amazon Nova 2 Multimodal Embeddings (1024-dim, via Bedrock).
-- product_embeddings.embedding is the only embedding column the live
-- matching functions (find_best_product_match, batch_match_products)
-- actually read — products.embedding / vendor_product_aliases.embedding
-- (added in earlier migrations) are unused by them and untouched here.
--
-- Old 768-dim vectors are meaningless once we switch models/dimensions —
-- truncate rather than attempt a cast, then flag every product for
-- re-embedding. generate-product-embeddings must be re-run (per company or
-- in bulk) after this migration to repopulate product_embeddings.
TRUNCATE public.product_embeddings;

DROP INDEX IF EXISTS idx_product_embeddings_hnsw;
ALTER TABLE public.product_embeddings ALTER COLUMN embedding TYPE vector(1024);
CREATE INDEX idx_product_embeddings_hnsw
  ON public.product_embeddings USING hnsw (embedding vector_cosine_ops);

UPDATE public.products SET embedding_needs_update = true WHERE is_active = true;

-- Re-create the two matching functions with the new dimension. Bodies are
-- otherwise identical to the current effective versions in
-- 20260610110943_c2bab6a5-37d4-410c-8750-da4c26c000bc.sql — only the
-- vector(768) casts changed to vector(1024).
CREATE OR REPLACE FUNCTION public.find_best_product_match(
  extracted_name TEXT, company_id UUID, supplier_id UUID DEFAULT NULL, query_embedding TEXT DEFAULT NULL
)
RETURNS TABLE(product_id UUID, product_name TEXT, confidence_score DECIMAL(5,2), matching_method TEXT)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  normalized_name TEXT;
  best_match RECORD;
  local_embedding vector(1024);
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
    BEGIN local_embedding := query_embedding::vector(1024);
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

CREATE OR REPLACE FUNCTION public.batch_match_products(
  _line_items JSONB, _company_id UUID, _supplier_id UUID DEFAULT NULL, _embeddings JSONB DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  item JSONB; result_item JSONB; results JSONB := '[]'::jsonb;
  embedding_str TEXT; parsed_invoice JSONB; inv_strength_str TEXT; inv_form TEXT;
  sem_candidate RECORD; hybrid_score DECIMAL(5,2);
  sem_best_score DECIMAL(5,2); sem_best_id UUID; sem_best_name TEXT;
  best_match RECORD; normalized_name TEXT; local_embedding vector(1024);
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
        BEGIN local_embedding := embedding_str::vector(1024);
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
