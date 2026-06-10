-- Consolidated migration: bring Lovable Cloud DB to parity with project code
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS canonical_name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS strength TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS form TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pack_size TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_products_company_id ON public.products(company_id);
CREATE INDEX IF NOT EXISTS idx_products_fingerprint ON public.products(fingerprint);
CREATE INDEX IF NOT EXISTS idx_products_canonical_name ON public.products(canonical_name);
CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON public.suppliers(company_id);

CREATE TABLE IF NOT EXISTS public.vendor_product_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  vendor_product_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  confidence_score DECIMAL(5,2) CHECK (confidence_score >= 0 AND confidence_score <= 100),
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, vendor_product_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_product_aliases TO authenticated;
GRANT ALL ON public.vendor_product_aliases TO service_role;

CREATE TABLE IF NOT EXISTS public.product_mapping_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  invoice_id UUID,
  supplier_id UUID REFERENCES public.suppliers(id),
  extracted_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  suggested_product_id UUID REFERENCES public.products(id),
  confidence_score DECIMAL(5,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
  matching_method TEXT NOT NULL CHECK (matching_method IN ('exact', 'fuzzy', 'semantic', 'alias', 'fingerprint', 'none')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_mapped')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_mapping_review_queue TO authenticated;
GRANT ALL ON public.product_mapping_review_queue TO service_role;

CREATE TABLE IF NOT EXISTS public.product_mapping_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  company_id UUID REFERENCES companies(id),
  total_scans INTEGER DEFAULT 0,
  auto_mapped INTEGER DEFAULT 0,
  human_approved INTEGER DEFAULT 0,
  new_products_created INTEGER DEFAULT 0,
  duplicates_prevented INTEGER DEFAULT 0,
  avg_confidence_score DECIMAL(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(date, company_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_mapping_stats TO authenticated;
GRANT ALL ON public.product_mapping_stats TO service_role;

ALTER TABLE public.vendor_product_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_mapping_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_mapping_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view aliases for their company suppliers" ON public.vendor_product_aliases;
CREATE POLICY "Users can view aliases for their company suppliers" ON public.vendor_product_aliases 
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = vendor_product_aliases.supplier_id AND s.company_id = get_user_company_id()));

DROP POLICY IF EXISTS "Admins can manage aliases" ON public.vendor_product_aliases;
CREATE POLICY "Admins can manage aliases" ON public.vendor_product_aliases 
  FOR ALL USING (EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = vendor_product_aliases.supplier_id AND s.company_id = get_user_company_id()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pharmacist')));

DROP POLICY IF EXISTS "Users can view review queue for their company" ON public.product_mapping_review_queue;
CREATE POLICY "Users can view review queue for their company" ON public.product_mapping_review_queue 
  FOR SELECT USING (company_id = get_user_company_id());

DROP POLICY IF EXISTS "Admins can manage review queue" ON public.product_mapping_review_queue;
CREATE POLICY "Admins can manage review queue" ON public.product_mapping_review_queue 
  FOR ALL USING (company_id = get_user_company_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pharmacist')));

DROP POLICY IF EXISTS "Users can view stats for their company" ON public.product_mapping_stats;
CREATE POLICY "Users can view stats for their company" ON public.product_mapping_stats 
  FOR SELECT USING (company_id = get_user_company_id());

DROP POLICY IF EXISTS "Admins can manage stats" ON public.product_mapping_stats;
CREATE POLICY "Admins can manage stats" ON public.product_mapping_stats 
  FOR ALL USING (company_id = get_user_company_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pharmacist')));

CREATE OR REPLACE FUNCTION public.normalize_product_text(input_text TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE normalized TEXT;
BEGIN
  normalized := lower(trim(input_text));
  normalized := regexp_replace(normalized, '[^\w\s]', ' ', 'g');
  normalized := regexp_replace(normalized, '\s+', ' ', 'g');
  normalized := regexp_replace(normalized, '\b(tablets|capsules|syrup|injection|ointment|cream|gel|drops|spray|inhaler|patch|suppository)\b', '', 'g');
  normalized := regexp_replace(normalized, '\b(ip|bp|usp|ep)\b', '', 'g');
  normalized := regexp_replace(normalized, '\b(strip of|box of|pack of|bottle of|tube of|vial of)\b', '', 'g');
  normalized := regexp_replace(normalized, '\b(each|pcs|pieces|units)\b', '', 'g');
  normalized := regexp_replace(normalized, '\b(tab|tabs)\b', 'tablet', 'g');
  normalized := regexp_replace(normalized, '\b(cap|caps)\b', 'capsule', 'g');
  normalized := regexp_replace(normalized, '\b(syr)\b', 'syrup', 'g');
  normalized := regexp_replace(normalized, '\b(inj)\b', 'injection', 'g');
  normalized := regexp_replace(normalized, '\b(oint)\b', 'ointment', 'g');
  normalized := regexp_replace(normalized, '\b(mg|mcg|g|ml|l)\b', '', 'g');
  normalized := trim(normalized);
  normalized := regexp_replace(normalized, '\s+', ' ', 'g');
  RETURN normalized;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_product_fingerprint(brand TEXT DEFAULT NULL, strength TEXT DEFAULT NULL, form TEXT DEFAULT NULL, pack_size TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  RETURN COALESCE(lower(trim(brand)), '') || '|' || COALESCE(lower(trim(strength)), '') || '|' || COALESCE(lower(trim(form)), '') || '|' || COALESCE(lower(trim(pack_size)), '');
END; $$;

CREATE OR REPLACE FUNCTION public.text_similarity(text1 TEXT, text2 TEXT)
RETURNS DECIMAL(5,2) LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE similarity DECIMAL(5,2); words1 TEXT[]; words2 TEXT[]; common_words INTEGER; total_words INTEGER;
BEGIN
  IF text1 IS NULL OR text2 IS NULL THEN RETURN 0; END IF;
  IF text1 = text2 THEN RETURN 100.0; END IF;
  words1 := string_to_array(lower(trim(text1)), ' ');
  words2 := string_to_array(lower(trim(text2)), ' ');
  common_words := 0;
  total_words := GREATEST(array_length(words1, 1), array_length(words2, 1));
  IF total_words = 0 THEN RETURN 0; END IF;
  FOR i IN 1..array_length(words1, 1) LOOP
    IF EXISTS (SELECT 1 FROM unnest(words2) w WHERE w = words1[i]) THEN common_words := common_words + 1; END IF;
  END LOOP;
  similarity := (common_words::DECIMAL / total_words::DECIMAL) * 100;
  RETURN ROUND(similarity, 2);
END; $$;

DROP TRIGGER IF EXISTS update_vendor_product_aliases_updated_at ON public.vendor_product_aliases;
CREATE TRIGGER update_vendor_product_aliases_updated_at BEFORE UPDATE ON public.vendor_product_aliases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_product_mapping_review_queue_updated_at ON public.product_mapping_review_queue;
CREATE TRIGGER update_product_mapping_review_queue_updated_at BEFORE UPDATE ON public.product_mapping_review_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_product_mapping_stats_updated_at ON public.product_mapping_stats;
CREATE TRIGGER update_product_mapping_stats_updated_at BEFORE UPDATE ON public.product_mapping_stats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_vendor_product_aliases_supplier_id ON public.vendor_product_aliases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_vendor_product_aliases_product_id ON public.vendor_product_aliases(product_id);
CREATE INDEX IF NOT EXISTS idx_vendor_product_aliases_normalized_name ON public.vendor_product_aliases(normalized_name);
CREATE INDEX IF NOT EXISTS idx_product_mapping_review_queue_status ON public.product_mapping_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_product_mapping_review_queue_created_at ON public.product_mapping_review_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_product_mapping_stats_date_company ON public.product_mapping_stats(date, company_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_products_company_id' AND table_name = 'products') THEN
    ALTER TABLE public.products ADD CONSTRAINT fk_products_company_id FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_suppliers_company_id' AND table_name = 'suppliers') THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT fk_suppliers_company_id FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
END $$;

-- Semantic search additions
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE public.vendor_product_aliases ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS idx_products_embedding_hnsw ON public.products USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_vendor_product_aliases_embedding_hnsw ON public.vendor_product_aliases USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION public.cosine_distance_to_confidence(distance FLOAT)
RETURNS DECIMAL(5,2) LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  RETURN GREATEST(0, LEAST(100, ROUND(((1.0 - distance) * 100.0)::NUMERIC, 2)));
END; $$;

CREATE OR REPLACE FUNCTION public.parse_product_text(input_text TEXT)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  cleaned TEXT; brand TEXT; strength_value NUMERIC; strength_unit TEXT; strength_str TEXT;
  form TEXT; pack_size TEXT; strength_match TEXT[]; pack_match TEXT[]; remainder TEXT; word TEXT; words TEXT[];
BEGIN
  IF input_text IS NULL OR trim(input_text) = '' THEN
    RETURN '{"brand":null,"strength_value":null,"strength_unit":null,"strength_str":null,"form":null,"pack_size":null}'::JSONB;
  END IF;
  cleaned := lower(trim(input_text));
  cleaned := regexp_replace(cleaned, '\b(tab|tabs)\b', 'tablet', 'g');
  cleaned := regexp_replace(cleaned, '\b(cap|caps)\b', 'capsule', 'g');
  cleaned := regexp_replace(cleaned, '\b(syr)\b', 'syrup', 'g');
  cleaned := regexp_replace(cleaned, '\b(inj)\b', 'injection', 'g');
  cleaned := regexp_replace(cleaned, '\b(oint)\b', 'ointment', 'g');
  cleaned := regexp_replace(cleaned, '\b(susp)\b', 'suspension', 'g');
  cleaned := regexp_replace(cleaned, '\b(sol)\b', 'solution', 'g');
  cleaned := regexp_replace(cleaned, '\b(drp|dps)\b', 'drops', 'g');
  cleaned := regexp_replace(cleaned, '\b(crm)\b', 'cream', 'g');
  cleaned := regexp_replace(cleaned, '[^\w\s]', ' ', 'g');
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
  cleaned := trim(cleaned);
  strength_match := regexp_matches(cleaned, '(\d+\.?\d*)\s*(mg|mcg|g|ml|l|%|iu|mcg/ml)?');
  IF strength_match IS NOT NULL THEN
    strength_value := strength_match[1]::NUMERIC;
    strength_unit := COALESCE(strength_match[2], '');
    strength_str := strength_match[1] || COALESCE(strength_match[2], '');
  END IF;
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
  pack_size := NULL;
  pack_match := regexp_matches(cleaned, '(\d+\.?\d*)\s*(ml|l|g|s|pcs|pieces|tablets|capsules|strips?|vials?|amps?|units?)?');
  IF pack_match IS NOT NULL THEN
    IF pack_match[1]::NUMERIC >= 2 AND (strength_str IS NULL OR pack_match[1] <> strength_value::TEXT) THEN
      pack_size := pack_match[1] || COALESCE(pack_match[2], '');
    END IF;
  END IF;
  brand := NULL;
  words := string_to_array(cleaned, ' ');
  FOR i IN 1..array_length(words, 1) LOOP
    word := words[i];
    IF word ~ '^\d+\.?\d*$' AND (strength_str IS NOT NULL AND word = strength_value::TEXT) THEN EXIT; END IF;
    IF word IN ('mg', 'mcg', 'g', 'ml', 'l', '%', 'iu') THEN EXIT; END IF;
    IF word IN ('tablet', 'tablets', 'capsule', 'capsules', 'syrup', 'injection', 'ointment', 'cream', 'gel', 'drops', 'spray', 'inhaler', 'suspension', 'solution', 'powder', 'granules', 'patch', 'suppository', 'suppositories', 'lotion') THEN EXIT; END IF;
    IF word IN ('ip', 'bp', 'usp', 'ep', 'strip', 'box', 'pack', 'bottle', 'tube', 'vial', 'of', 'each', 'pcs', 'pieces', 'units') THEN EXIT; END IF;
    IF brand IS NULL THEN brand := word; ELSE brand := brand || ' ' || word; END IF;
  END LOOP;
  RETURN jsonb_build_object('brand', brand, 'strength_value', strength_value, 'strength_unit', strength_unit, 'strength_str', strength_str, 'form', form, 'pack_size', pack_size);
END; $$;

CREATE OR REPLACE FUNCTION public.compute_hybrid_match_score(_parsed_invoice JSONB, _candidate_product JSONB, _vector_similarity FLOAT DEFAULT NULL)
RETURNS DECIMAL(5,2) LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  score DECIMAL(5,2) := 0; w_alias DECIMAL(5,2) := 40; w_strength DECIMAL(5,2) := 30;
  w_form DECIMAL(5,2) := 20; w_token DECIMAL(5,2) := 5; w_vector DECIMAL(5,2) := 5;
  inv_brand TEXT; inv_strength_str TEXT; inv_form TEXT;
  cand_brand TEXT; cand_strength TEXT; cand_form TEXT; cand_name TEXT; token_score DECIMAL(5,2);
BEGIN
  inv_brand := _parsed_invoice->>'brand';
  inv_strength_str := _parsed_invoice->>'strength_str';
  inv_form := _parsed_invoice->>'form';
  cand_brand := lower(trim(COALESCE(_candidate_product->>'brand', '')));
  cand_strength := lower(trim(COALESCE(_candidate_product->>'strength', '')));
  cand_form := lower(trim(COALESCE(_candidate_product->>'form', '')));
  cand_name := lower(trim(COALESCE(_candidate_product->>'product_name', '')));
  IF inv_strength_str IS NOT NULL AND inv_strength_str <> '' THEN
    IF regexp_replace(cand_strength, '\s+', '', 'g') = regexp_replace(inv_strength_str, '\s+', '', 'g') THEN score := score + w_strength; END IF;
  ELSE
    IF cand_strength IS NULL OR cand_strength = '' THEN score := score + w_strength * 0.5; END IF;
  END IF;
  IF inv_form IS NOT NULL AND inv_form <> '' THEN
    IF cand_form = inv_form THEN score := score + w_form; END IF;
  ELSE
    IF cand_form IS NULL OR cand_form = '' THEN score := score + w_form * 0.5; END IF;
  END IF;
  IF inv_brand IS NOT NULL AND inv_brand <> '' AND cand_name IS NOT NULL AND cand_name <> '' THEN
    token_score := text_similarity(inv_brand, cand_name);
    score := score + (token_score / 100.0) * w_token;
  END IF;
  IF _vector_similarity IS NOT NULL THEN score := score + _vector_similarity * w_vector; END IF;
  RETURN ROUND(score, 2);
END; $$;

CREATE OR REPLACE FUNCTION public.find_best_product_match(extracted_name TEXT, company_id UUID, supplier_id UUID DEFAULT NULL, query_embedding TEXT DEFAULT NULL)
RETURNS TABLE(product_id UUID, product_name TEXT, confidence_score DECIMAL(5,2), matching_method TEXT)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  normalized_name TEXT; best_match RECORD; local_embedding vector(768);
  parsed_invoice JSONB; inv_strength_str TEXT; inv_form TEXT;
  hybrid_score DECIMAL(5,2); sem_candidate RECORD; sem_score DECIMAL(5,2);
  sem_best_score DECIMAL(5,2) := 0; sem_best_id UUID; sem_best_name TEXT;
BEGIN
  normalized_name := normalize_product_text(extracted_name);
  parsed_invoice := parse_product_text(extracted_name);
  inv_strength_str := parsed_invoice->>'strength_str';
  inv_form := parsed_invoice->>'form';
  IF query_embedding IS NOT NULL AND query_embedding <> '' THEN
    BEGIN local_embedding := query_embedding::vector(768);
    EXCEPTION WHEN OTHERS THEN local_embedding := NULL;
    END;
  END IF;
  SELECT p.id AS product_id, p.name AS product_name, 100.0::DECIMAL(5,2) AS confidence_score, 'exact'::TEXT AS matching_method
  INTO best_match FROM products p
  WHERE p.company_id = find_best_product_match.company_id AND p.is_active = true AND lower(trim(p.name)) = lower(trim(extracted_name))
  LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method; RETURN; END IF;
  IF supplier_id IS NOT NULL THEN
    SELECT vpa.product_id AS product_id, p.name AS product_name, vpa.confidence_score AS confidence_score, 'alias'::TEXT AS matching_method
    INTO best_match FROM vendor_product_aliases vpa JOIN products p ON p.id = vpa.product_id
    WHERE vpa.supplier_id = find_best_product_match.supplier_id AND vpa.is_approved = true AND lower(vpa.vendor_product_name) = lower(extracted_name)
    LIMIT 1;
    IF FOUND THEN
      UPDATE vendor_product_aliases SET usage_count = usage_count + 1, last_used_at = now()
      WHERE supplier_id = find_best_product_match.supplier_id AND is_approved = true AND lower(vendor_product_name) = lower(extracted_name);
      RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method; RETURN;
    END IF;
  END IF;
  IF local_embedding IS NOT NULL THEN
    FOR sem_candidate IN
      SELECT p.id, p.name, p.brand, p.strength, p.form, cosine_distance_to_confidence(p.embedding <=> local_embedding) AS raw_similarity
      FROM products p
      WHERE p.company_id = find_best_product_match.company_id AND p.is_active = true AND p.embedding IS NOT NULL
        AND (inv_strength_str IS NULL OR inv_strength_str = '' OR lower(trim(COALESCE(p.strength, ''))) = lower(trim(inv_strength_str)))
        AND (inv_form IS NULL OR inv_form = '' OR lower(trim(COALESCE(p.form, ''))) = lower(trim(inv_form)))
      ORDER BY p.embedding <=> local_embedding ASC LIMIT 10
    LOOP
      hybrid_score := compute_hybrid_match_score(parsed_invoice,
        jsonb_build_object('product_id', sem_candidate.id, 'product_name', sem_candidate.name, 'brand', sem_candidate.brand, 'strength', sem_candidate.strength, 'form', sem_candidate.form),
        (1.0 - (sem_candidate.raw_similarity / 100.0)));
      IF hybrid_score > sem_best_score THEN sem_best_score := hybrid_score; sem_best_id := sem_candidate.id; sem_best_name := sem_candidate.name; END IF;
    END LOOP;
    IF sem_best_id IS NULL THEN
      FOR sem_candidate IN
        SELECT p.id, p.name, p.brand, p.strength, p.form, cosine_distance_to_confidence(p.embedding <=> local_embedding) AS raw_similarity
        FROM products p
        WHERE p.company_id = find_best_product_match.company_id AND p.is_active = true AND p.embedding IS NOT NULL
        ORDER BY p.embedding <=> local_embedding ASC LIMIT 10
      LOOP
        hybrid_score := compute_hybrid_match_score(parsed_invoice,
          jsonb_build_object('product_id', sem_candidate.id, 'product_name', sem_candidate.name, 'brand', sem_candidate.brand, 'strength', sem_candidate.strength, 'form', sem_candidate.form),
          (1.0 - (sem_candidate.raw_similarity / 100.0)));
        IF hybrid_score > sem_best_score THEN sem_best_score := hybrid_score; sem_best_id := sem_candidate.id; sem_best_name := sem_candidate.name; END IF;
      END LOOP;
    END IF;
    IF sem_best_id IS NOT NULL AND sem_best_score >= 50.0 THEN
      RETURN QUERY SELECT sem_best_id, sem_best_name, sem_best_score, 'semantic'::TEXT; RETURN;
    END IF;
  END IF;
  SELECT p.id AS product_id, p.name AS product_name, 95.0::DECIMAL(5,2) AS confidence_score, 'fingerprint'::TEXT AS matching_method
  INTO best_match FROM products p
  WHERE p.company_id = find_best_product_match.company_id AND p.is_active = true AND p.fingerprint IS NOT NULL
    AND p.fingerprint = generate_product_fingerprint(parsed_invoice->>'brand', parsed_invoice->>'strength_str', parsed_invoice->>'form', parsed_invoice->>'pack_size')
  LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method; RETURN; END IF;
  SELECT p.id AS product_id, p.name AS product_name, text_similarity(normalized_name, normalize_product_text(p.name)) AS confidence_score, 'fuzzy'::TEXT AS matching_method
  INTO best_match FROM products p
  WHERE p.company_id = find_best_product_match.company_id AND p.is_active = true
    AND text_similarity(normalized_name, normalize_product_text(p.name)) >= 75.0
  ORDER BY text_similarity(normalized_name, normalize_product_text(p.name)) DESC LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method; RETURN; END IF;
  RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 0.0::DECIMAL(5,2), 'none'::TEXT;
END; $$;

CREATE OR REPLACE FUNCTION public.auto_populate_product_fingerprint()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE parsed JSONB;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name) THEN
    parsed := parse_product_text(NEW.name);
    NEW.brand := COALESCE(parsed->>'brand', NULL);
    NEW.strength := COALESCE(parsed->>'strength_str', NULL);
    NEW.form := COALESCE(parsed->>'form', NULL);
    NEW.pack_size := COALESCE(parsed->>'pack_size', NULL);
    NEW.fingerprint := generate_product_fingerprint(NEW.brand, NEW.strength, NEW.form, NEW.pack_size);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_populate_product_fingerprint ON public.products;
CREATE TRIGGER trg_auto_populate_product_fingerprint BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.auto_populate_product_fingerprint();

UPDATE public.products SET
  brand = COALESCE(brand, (parse_product_text(name)->>'brand')),
  strength = COALESCE(strength, (parse_product_text(name)->>'strength_str')),
  form = COALESCE(form, (parse_product_text(name)->>'form')),
  pack_size = COALESCE(pack_size, (parse_product_text(name)->>'pack_size'))
WHERE brand IS NULL OR strength IS NULL OR form IS NULL OR pack_size IS NULL;

UPDATE public.products SET fingerprint = generate_product_fingerprint(brand, strength, form, pack_size) WHERE name IS NOT NULL;