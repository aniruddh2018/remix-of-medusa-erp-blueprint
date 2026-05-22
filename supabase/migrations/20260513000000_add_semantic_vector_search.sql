-- Product Mapping Semantic Search Upgrade
-- Adds pgvector support, semantic embedding columns, and upgrades
-- find_best_product_match to use vector similarity.

-- NOTE: Enable the vector extension in Supabase Dashboard if this fails
-- (Database > Extensions > vector)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding columns for semantic search
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE public.vendor_product_aliases ADD COLUMN IF NOT EXISTS embedding vector(768);

-- HNSW indexes for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_products_embedding_hnsw
  ON public.products
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_vendor_product_aliases_embedding_hnsw
  ON public.vendor_product_aliases
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Helper: convert pgvector cosine distance (0=identical ... 2=opposite) to a 0-100 confidence score
CREATE OR REPLACE FUNCTION public.cosine_distance_to_confidence(distance FLOAT)
RETURNS DECIMAL(5,2)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- Cosine similarity = 1 - distance. Clamp to [0, 100].
  RETURN GREATEST(0, LEAST(100, ROUND(((1.0 - distance) * 100.0)::NUMERIC, 2)));
END;
$$;

-- Upgrade find_best_product_match with optional semantic vector search
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
BEGIN
  -- Normalize the input
  normalized_name := normalize_product_text(extracted_name);
  
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
  
  -- 3. Try semantic vector match (if embedding provided and products have embeddings)
  IF local_embedding IS NOT NULL THEN
    SELECT p.id AS product_id, p.name AS product_name, 
           cosine_distance_to_confidence(p.embedding <=> local_embedding) AS confidence_score,
           'semantic'::TEXT AS matching_method
    INTO best_match
    FROM products p
    WHERE p.company_id = find_best_product_match.company_id
      AND p.is_active = true
      AND p.embedding IS NOT NULL
    ORDER BY p.embedding <=> local_embedding ASC
    LIMIT 1;
    
    IF FOUND AND best_match.confidence_score >= 80.0 THEN
      RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method;
      RETURN;
    END IF;
  END IF;
  
  -- 4. Try fingerprint match
  SELECT p.id AS product_id, p.name AS product_name, 95.0::DECIMAL(5,2) AS confidence_score, 'fingerprint'::TEXT AS matching_method
  INTO best_match
  FROM products p
  WHERE p.company_id = find_best_product_match.company_id
    AND p.is_active = true
    AND p.fingerprint = generate_product_fingerprint(
      split_part(normalized_name, ' ', 1),
      (SELECT array_to_string(array_agg(word), ' ') 
       FROM unnest(string_to_array(normalized_name, ' ')) word 
       WHERE word ~ '\d+(mg|mcg|g|ml)?'),
      NULL,
      NULL
    )
  LIMIT 1;
  
  IF FOUND THEN
    RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method;
    RETURN;
  END IF;
  
  -- 5. Try fuzzy matching
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
