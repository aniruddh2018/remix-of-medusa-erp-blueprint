-- Phase 2: Product Normalization Pipeline + Hybrid Scoring + Deterministic Filters
-- Parses raw product text into structured fields, uses hard constraints before vector search,
-- and scores with weighted hybrid scoring instead of raw embedding similarity.

-- ============================================================
-- 2.1: parse_product_text — Structured product name parser
-- ============================================================
-- Extracts brand, strength, form, pack_size from raw pharmacy product names.
-- Examples:
--   "DOLO 650 MG TABLET" → brand=dolo, strength_value=650, strength_unit=mg, form=tablet
--   "CROCIN 650MG TAB"   → brand=crocin, strength_value=650, strength_unit=mg, form=tablet
--   "BECOSULES CAPSULE"  → brand=becosules, strength_value=null, form=capsule
--   "CALPOL 250MG SYRUP 60ML" → brand=calpol, strength_value=250, strength_unit=mg, form=syrup, pack_size=60ml

CREATE OR REPLACE FUNCTION public.parse_product_text(input_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned TEXT;
  -- Brand: first alphabetic word(s) before any number
  brand TEXT;
  -- Strength: numeric value + unit
  strength_value NUMERIC;
  strength_unit TEXT;
  strength_str TEXT;
  -- Form: known pharmaceutical form keyword
  form TEXT;
  -- Pack size: count + optional unit (e.g., "30 tablets", "60ml")
  pack_size TEXT;
  -- Regex captures
  strength_match TEXT[];
  pack_match TEXT[];
  -- Working string after stripping known parts
  remainder TEXT;
  word TEXT;
  words TEXT[];
BEGIN
  IF input_text IS NULL OR trim(input_text) = '' THEN
    RETURN '{"brand":null,"strength_value":null,"strength_unit":null,"strength_str":null,"form":null,"pack_size":null}'::JSONB;
  END IF;

  cleaned := lower(trim(input_text));

  -- Normalize common abbreviations for parsing consistency
  cleaned := regexp_replace(cleaned, '\b(tab|tabs)\b', 'tablet', 'g');
  cleaned := regexp_replace(cleaned, '\b(cap|caps)\b', 'capsule', 'g');
  cleaned := regexp_replace(cleaned, '\b(syr)\b', 'syrup', 'g');
  cleaned := regexp_replace(cleaned, '\b(inj)\b', 'injection', 'g');
  cleaned := regexp_replace(cleaned, '\b(oint)\b', 'ointment', 'g');
  cleaned := regexp_replace(cleaned, '\b(susp)\b', 'suspension', 'g');
  cleaned := regexp_replace(cleaned, '\b(sol)\b', 'solution', 'g');
  cleaned := regexp_replace(cleaned, '\b(drp|dps)\b', 'drops', 'g');
  cleaned := regexp_replace(cleaned, '\b(crm)\b', 'cream', 'g');

  -- Remove punctuation, collapse whitespace
  cleaned := regexp_replace(cleaned, '[^\w\s]', ' ', 'g');
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
  cleaned := trim(cleaned);

  -- ── Extract strength: number optionally followed by unit ──
  -- Matches patterns: "650 mg", "650mg", "500mcg", "250", "5%"
  strength_match := regexp_matches(cleaned, '(\d+\.?\d*)\s*(mg|mcg|g|ml|l|%|iu|mcg/ml)?');
  IF strength_match IS NOT NULL THEN
    strength_value := strength_match[1]::NUMERIC;
    strength_unit := COALESCE(strength_match[2], '');
    strength_str := strength_match[1] || COALESCE(strength_match[2], '');
  END IF;

  -- ── Extract form: known pharmaceutical form keyword ──
  form := NULL;
  IF cleaned ~ '\m(tablet|tablets)\M' THEN form := 'tablet';
  ELSIF cleaned ~ '\m(capsule|capsules)\M' THEN form := 'capsule';
  ELSIF cleaned ~ '\m(syrup)\M' THEN form := 'syrup';
  ELSIF cleaned ~ '\m(injection)\M' THEN form := 'injection';
  ELSIF cleaned ~ '\m(ointment)\M' THEN form := 'ointment';
  ELSIF cleaned ~ '\m(cream)\M' THEN form := 'cream';
  ELSIF cleaned ~ '\m(gel)\M' THEN form := 'gel';
  ELSIF cleaned ~ '\m(drops)\M' THEN form := 'drops';
  ELSIF cleaned ~ '\m(spray)\M' THEN form := 'spray';
  ELSIF cleaned ~ '\m(inhaler)\M' THEN form := 'inhaler';
  ELSIF cleaned ~ '\m(suspension)\M' THEN form := 'suspension';
  ELSIF cleaned ~ '\m(solution)\M' THEN form := 'solution';
  ELSIF cleaned ~ '\m(powder)\M' THEN form := 'powder';
  ELSIF cleaned ~ '\m(granules)\M' THEN form := 'granules';
  ELSIF cleaned ~ '\m(patch)\M' THEN form := 'patch';
  ELSIF cleaned ~ '\m(suppository|suppositories)\M' THEN form := 'suppository';
  ELSIF cleaned ~ '\m(lotion)\M' THEN form := 'lotion';
  END IF;

  -- ── Extract pack size: number + optional unit before form keyword ──
  -- "strip of 10", "10 tablets", "60ml", "30 s"
  pack_size := NULL;
  pack_match := regexp_matches(cleaned, '(\d+\.?\d*)\s*(ml|l|g|s|pcs|pieces|tablets|capsules|strips?|vials?|amps?|units?)?');
  IF pack_match IS NOT NULL THEN
    -- Only capture as pack_size if the number is >= 2 (not a single tablet) and not the strength
    IF pack_match[1]::NUMERIC >= 2 AND (strength_str IS NULL OR pack_match[1] <> strength_value::TEXT) THEN
      pack_size := pack_match[1] || COALESCE(pack_match[2], '');
    END IF;
  END IF;

  -- ── Extract brand: first alphabetic word(s) before the first number or form ──
  brand := NULL;
  words := string_to_array(cleaned, ' ');

  -- Find the first numeric token or form token — everything before it is brand
  FOR i IN 1..array_length(words, 1) LOOP
    word := words[i];
    -- Stop at strength number
    IF word ~ '^\d+\.?\d*$' AND (strength_str IS NOT NULL AND word = strength_value::TEXT) THEN
      EXIT;
    END IF;
    -- Stop at unit tokens
    IF word IN ('mg', 'mcg', 'g', 'ml', 'l', '%', 'iu') THEN
      EXIT;
    END IF;
    -- Stop at form tokens
    IF word IN ('tablet', 'tablets', 'capsule', 'capsules', 'syrup', 'injection',
                'ointment', 'cream', 'gel', 'drops', 'spray', 'inhaler',
                'suspension', 'solution', 'powder', 'granules', 'patch',
                'suppository', 'suppositories', 'lotion') THEN
      EXIT;
    END IF;
    -- Stop at noise words
    IF word IN ('ip', 'bp', 'usp', 'ep', 'strip', 'box', 'pack', 'bottle', 'tube', 'vial', 'of', 'each', 'pcs', 'pieces', 'units') THEN
      EXIT;
    END IF;

    -- This word is part of the brand
    IF brand IS NULL THEN
      brand := word;
    ELSE
      brand := brand || ' ' || word;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'brand', brand,
    'strength_value', strength_value,
    'strength_unit', strength_unit,
    'strength_str', strength_str,
    'form', form,
    'pack_size', pack_size
  );
END;
$$;


-- ============================================================
-- 2.2: compute_hybrid_match_score — Weighted scoring engine
-- ============================================================
-- Combines multiple signals into a single 0–100 confidence score.
-- Weights are tuned for pharmacy product matching.

CREATE OR REPLACE FUNCTION public.compute_hybrid_match_score(
  _parsed_invoice JSONB,       -- parse_product_text output for the invoice item
  _candidate_product JSONB,    -- {product_id, product_name, brand, strength, form, fingerprint, embedding_distance}
  _vector_similarity FLOAT DEFAULT NULL  -- 0–1 cosine similarity from pgvector
)
RETURNS DECIMAL(5,2)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  score DECIMAL(5,2) := 0;
  -- Weights (total = 100)
  w_alias DECIMAL(5,2) := 40;
  w_strength DECIMAL(5,2) := 30;
  w_form DECIMAL(5,2) := 20;
  w_token DECIMAL(5,2) := 5;
  w_vector DECIMAL(5,2) := 5;
  -- Parsed invoice fields
  inv_brand TEXT;
  inv_strength_str TEXT;
  inv_form TEXT;
  -- Candidate product fields
  cand_brand TEXT;
  cand_strength TEXT;
  cand_form TEXT;
  cand_name TEXT;
  -- Token overlap
  token_score DECIMAL(5,2);
BEGIN
  inv_brand := _parsed_invoice->>'brand';
  inv_strength_str := _parsed_invoice->>'strength_str';
  inv_form := _parsed_invoice->>'form';
  cand_brand := lower(trim(COALESCE(_candidate_product->>'brand', '')));
  cand_strength := lower(trim(COALESCE(_candidate_product->>'strength', '')));
  cand_form := lower(trim(COALESCE(_candidate_product->>'form', '')));
  cand_name := lower(trim(COALESCE(_candidate_product->>'product_name', '')));

  -- 1. Strength match (30 points)
  IF inv_strength_str IS NOT NULL AND inv_strength_str <> '' THEN
    -- Normalize: strip spaces for comparison (650 mg = 650mg)
    IF regexp_replace(cand_strength, '\s+', '', 'g') = regexp_replace(inv_strength_str, '\s+', '', 'g') THEN
      score := score + w_strength;
    END IF;
  ELSE
    -- No strength in invoice — partial credit if candidate also has no strength
    IF cand_strength IS NULL OR cand_strength = '' THEN
      score := score + w_strength * 0.5;
    END IF;
  END IF;

  -- 2. Form match (20 points)
  IF inv_form IS NOT NULL AND inv_form <> '' THEN
    IF cand_form = inv_form THEN
      score := score + w_form;
    END IF;
  ELSE
    -- No form in invoice — partial credit
    IF cand_form IS NULL OR cand_form = '' THEN
      score := score + w_form * 0.5;
    END IF;
  END IF;

  -- 3. Brand/token overlap (5 points) — Jaccard-like word overlap
  IF inv_brand IS NOT NULL AND inv_brand <> '' AND cand_name IS NOT NULL AND cand_name <> '' THEN
    token_score := text_similarity(inv_brand, cand_name);
    score := score + (token_score / 100.0) * w_token;
  END IF;

  -- 4. Vector similarity (5 points)
  IF _vector_similarity IS NOT NULL THEN
    score := score + _vector_similarity * w_vector;
  END IF;

  RETURN ROUND(score, 2);
END;
$$;


-- ============================================================
-- 2.3: Updated find_best_product_match with deterministic filters
--      and hybrid scoring (replaces 20260513 version)
-- ============================================================
-- Pipeline: exact → alias → deterministic-filtered vector → hybrid-scored best
-- Key change: vector search is filtered by strength+form BEFORE similarity scan,
-- dramatically reducing false positives.

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

  -- 3. Deterministic-filtered semantic match (NEW PHASE 2 LOGIC)
  -- Filter by strength and form BEFORE vector similarity scan
  IF local_embedding IS NOT NULL THEN
    -- Try with full deterministic filter first (strength + form)
    FOR sem_candidate IN
      SELECT p.id, p.name, p.brand, p.strength, p.form,
             cosine_distance_to_confidence(p.embedding <=> local_embedding) AS raw_similarity
      FROM products p
      WHERE p.company_id = find_best_product_match.company_id
        AND p.is_active = true
        AND p.embedding IS NOT NULL
        -- Deterministic filters: strength and/or form must match if we have them
        AND (inv_strength_str IS NULL OR inv_strength_str = ''
             OR lower(trim(COALESCE(p.strength, ''))) = lower(trim(inv_strength_str)))
        AND (inv_form IS NULL OR inv_form = ''
             OR lower(trim(COALESCE(p.form, ''))) = lower(trim(inv_form)))
      ORDER BY p.embedding <=> local_embedding ASC
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
        (1.0 - (sem_candidate.raw_similarity / 100.0))  -- convert confidence back to similarity
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
               cosine_distance_to_confidence(p.embedding <=> local_embedding) AS raw_similarity
        FROM products p
        WHERE p.company_id = find_best_product_match.company_id
          AND p.is_active = true
          AND p.embedding IS NOT NULL
        ORDER BY p.embedding <=> local_embedding ASC
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


-- ============================================================
-- 2.4: Auto-populate fingerprint/brand/strength/form on product insert/update
-- ============================================================
-- Trigger function: runs parse_product_text on every insert/update,
-- populates brand, strength, form, pack_size, and fingerprint.

CREATE OR REPLACE FUNCTION public.auto_populate_product_fingerprint()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parsed JSONB;
BEGIN
  -- Only process if name changed or new row
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name) THEN
    parsed := parse_product_text(NEW.name);

    NEW.brand := COALESCE(parsed->>'brand', NULL);
    NEW.strength := COALESCE(parsed->>'strength_str', NULL);
    NEW.form := COALESCE(parsed->>'form', NULL);
    NEW.pack_size := COALESCE(parsed->>'pack_size', NULL);
    NEW.fingerprint := generate_product_fingerprint(
      NEW.brand,
      NEW.strength,
      NEW.form,
      NEW.pack_size
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any (safe), then create
DROP TRIGGER IF EXISTS trg_auto_populate_product_fingerprint ON public.products;
CREATE TRIGGER trg_auto_populate_product_fingerprint
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_populate_product_fingerprint();


-- ============================================================
-- 2.5: Backfill existing products
-- ============================================================
-- Populate brand, strength, form, pack_size, and fingerprint for
-- all existing products that have NULL values.

UPDATE public.products
SET
  brand = COALESCE(brand, (parse_product_text(name)->>'brand')),
  strength = COALESCE(strength, (parse_product_text(name)->>'strength_str')),
  form = COALESCE(form, (parse_product_text(name)->>'form')),
  pack_size = COALESCE(pack_size, (parse_product_text(name)->>'pack_size'))
WHERE
  brand IS NULL
  OR strength IS NULL
  OR form IS NULL
  OR pack_size IS NULL;

-- Regenerate fingerprints for all products (ensures consistency)
UPDATE public.products
SET fingerprint = generate_product_fingerprint(brand, strength, form, pack_size)
WHERE name IS NOT NULL;
