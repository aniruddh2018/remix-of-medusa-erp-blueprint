-- Consolidated migration: bring Lovable Cloud DB to parity with project code
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
-- ============================================================
-- supabase/migrations/20260512000000_product_mapping_system.sql
-- ============================================================
-- Product Mapping & Duplicate Prevention System
-- This migration adds the infrastructure for intelligent product resolution
-- All ALTER TABLE statements are idempotent (IF NOT EXISTS) so they safely
-- skip columns/indexes that were already created by a previous migration run.

-- Add company_id to existing tables for multi-tenancy (safe: skip if exists)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Add product fingerprinting fields to products table (safe: skip if exists)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS canonical_name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS strength TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS form TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pack_size TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS fingerprint TEXT; -- brand|strength|form|pack_size

-- Create indexes for performance (safe: skip if exists)
CREATE INDEX IF NOT EXISTS idx_products_company_id ON public.products(company_id);
CREATE INDEX IF NOT EXISTS idx_products_fingerprint ON public.products(fingerprint);
CREATE INDEX IF NOT EXISTS idx_products_canonical_name ON public.products(canonical_name);
CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON public.suppliers(company_id);

-- Vendor Product Aliases Table
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

-- Product Mapping Review Queue Table
-- company_id stored directly so RLS can filter without a join
CREATE TABLE IF NOT EXISTS public.product_mapping_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  invoice_id UUID,
  supplier_id UUID REFERENCES public.suppliers(id),
  extracted_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  suggested_product_id UUID REFERENCES public.products(id),
  confidence_score DECIMAL(5,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
  -- 'none' = no candidate found at all
  matching_method TEXT NOT NULL CHECK (matching_method IN ('exact', 'fuzzy', 'semantic', 'alias', 'fingerprint', 'none')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_mapped')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Product Mapping Statistics Table
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

-- Enable RLS on new tables
ALTER TABLE public.vendor_product_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_mapping_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_mapping_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vendor_product_aliases
-- DROP first so re-runs don't fail on duplicate policy name
DROP POLICY IF EXISTS "Users can view aliases for their company suppliers" ON public.vendor_product_aliases;
CREATE POLICY "Users can view aliases for their company suppliers" ON public.vendor_product_aliases 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = vendor_product_aliases.supplier_id
        AND s.company_id = get_user_company_id()
    )
  );

DROP POLICY IF EXISTS "Admins can manage aliases" ON public.vendor_product_aliases;
CREATE POLICY "Admins can manage aliases" ON public.vendor_product_aliases 
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = vendor_product_aliases.supplier_id
        AND s.company_id = get_user_company_id()
    )
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pharmacist'))
  );

-- RLS Policies for product_mapping_review_queue (uses direct company_id column)
DROP POLICY IF EXISTS "Users can view review queue for their company" ON public.product_mapping_review_queue;
CREATE POLICY "Users can view review queue for their company" ON public.product_mapping_review_queue 
  FOR SELECT USING (company_id = get_user_company_id());

DROP POLICY IF EXISTS "Admins can manage review queue" ON public.product_mapping_review_queue;
CREATE POLICY "Admins can manage review queue" ON public.product_mapping_review_queue 
  FOR ALL USING (
    company_id = get_user_company_id()
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pharmacist'))
  );

-- RLS Policies for product_mapping_stats
DROP POLICY IF EXISTS "Users can view stats for their company" ON public.product_mapping_stats;
CREATE POLICY "Users can view stats for their company" ON public.product_mapping_stats 
  FOR SELECT USING (company_id = get_user_company_id());

DROP POLICY IF EXISTS "Admins can manage stats" ON public.product_mapping_stats;
CREATE POLICY "Admins can manage stats" ON public.product_mapping_stats 
  FOR ALL USING (
    company_id = get_user_company_id()
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pharmacist'))
  );

-- Create function to normalize product text
CREATE OR REPLACE FUNCTION public.normalize_product_text(input_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  normalized TEXT;
BEGIN
  -- Convert to lowercase and remove extra spaces
  normalized := lower(trim(input_text));
  
  -- Remove common punctuation
  normalized := regexp_replace(normalized, '[^\w\s]', ' ', 'g');
  
  -- Remove extra spaces
  normalized := regexp_replace(normalized, '\s+', ' ', 'g');
  
  -- Remove common medical filler words
  normalized := regexp_replace(normalized, '\b(tablets|capsules|syrup|injection|ointment|cream|gel|drops|spray|inhaler|patch|suppository)\b', '', 'g');
  normalized := regexp_replace(normalized, '\b(ip|bp|usp|ep)\b', '', 'g'); -- Pharmacopeia references
  normalized := regexp_replace(normalized, '\b(strip of|box of|pack of|bottle of|tube of|vial of)\b', '', 'g');
  normalized := regexp_replace(normalized, '\b(each|pcs|pieces|units)\b', '', 'g');
  
  -- Normalize common abbreviations
  normalized := regexp_replace(normalized, '\b(tab|tabs)\b', 'tablet', 'g');
  normalized := regexp_replace(normalized, '\b(cap|caps)\b', 'capsule', 'g');
  normalized := regexp_replace(normalized, '\b(syr)\b', 'syrup', 'g');
  normalized := regexp_replace(normalized, '\b(inj)\b', 'injection', 'g');
  normalized := regexp_replace(normalized, '\b(oint)\b', 'ointment', 'g');
  normalized := regexp_replace(normalized, '\b(mg|mcg|g|ml|l)\b', '', 'g'); -- Remove units, will be extracted separately
  
  -- Clean up final spaces
  normalized := trim(normalized);
  normalized := regexp_replace(normalized, '\s+', ' ', 'g');
  
  RETURN normalized;
END;
$$;

-- Create function to generate product fingerprint
CREATE OR REPLACE FUNCTION public.generate_product_fingerprint(
  brand TEXT DEFAULT NULL,
  strength TEXT DEFAULT NULL,
  form TEXT DEFAULT NULL,
  pack_size TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(lower(trim(brand)), '') || '|' || 
         COALESCE(lower(trim(strength)), '') || '|' || 
         COALESCE(lower(trim(form)), '') || '|' || 
         COALESCE(lower(trim(pack_size)), '');
END;
$$;

-- Create function to calculate text similarity (simple implementation)
CREATE OR REPLACE FUNCTION public.text_similarity(text1 TEXT, text2 TEXT)
RETURNS DECIMAL(5,2)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  similarity DECIMAL(5,2);
  words1 TEXT[];
  words2 TEXT[];
  common_words INTEGER;
  total_words INTEGER;
BEGIN
  IF text1 IS NULL OR text2 IS NULL THEN
    RETURN 0;
  END IF;
  
  IF text1 = text2 THEN
    RETURN 100.0;
  END IF;
  
  -- Split into words
  words1 := string_to_array(lower(trim(text1)), ' ');
  words2 := string_to_array(lower(trim(text2)), ' ');
  
  -- Count common words
  common_words := 0;
  total_words := GREATEST(array_length(words1, 1), array_length(words2, 1));
  
  IF total_words = 0 THEN
    RETURN 0;
  END IF;
  
  -- Simple word overlap calculation
  FOR i IN 1..array_length(words1, 1) LOOP
    IF EXISTS (SELECT 1 FROM unnest(words2) w WHERE w = words1[i]) THEN
      common_words := common_words + 1;
    END IF;
  END LOOP;
  
  similarity := (common_words::DECIMAL / total_words::DECIMAL) * 100;
  
  RETURN ROUND(similarity, 2);
END;
$$;

-- Create function to find best product match
CREATE OR REPLACE FUNCTION public.find_best_product_match(
  extracted_name TEXT,
  company_id UUID,
  supplier_id UUID DEFAULT NULL
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
BEGIN
  -- Normalize the input
  normalized_name := normalize_product_text(extracted_name);
  
  -- Try exact match first
  SELECT p.id, p.name, 100.0::DECIMAL(5,2), 'exact'::TEXT
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
  
  -- Try alias match
  IF supplier_id IS NOT NULL THEN
    SELECT vpa.product_id, p.name, vpa.confidence_score, 'alias'::TEXT
    INTO best_match
    FROM vendor_product_aliases vpa
    JOIN products p ON p.id = vpa.product_id
    WHERE vpa.supplier_id = find_best_product_match.supplier_id
      AND vpa.is_approved = true
      AND lower(vpa.vendor_product_name) = lower(extracted_name)
    LIMIT 1;
    
    IF FOUND THEN
      -- Update usage count (correlated update — does not need vpa.id in scope)
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
  
  -- Try fingerprint match
  SELECT p.id, p.name, 95.0::DECIMAL(5,2), 'fingerprint'::TEXT
  INTO best_match
  FROM products p
  WHERE p.company_id = find_best_product_match.company_id
    AND p.is_active = true
    AND p.fingerprint = generate_product_fingerprint(
      -- Extract from normalized name (simplified)
      split_part(normalized_name, ' ', 1), -- brand
      (SELECT array_to_string(array_agg(word), ' ') 
       FROM unnest(string_to_array(normalized_name, ' ')) word 
       WHERE word ~ '\d+(mg|mcg|g|ml)?'), -- strength
      NULL, -- form
      NULL  -- pack_size
    )
  LIMIT 1;
  
  IF FOUND THEN
    RETURN QUERY SELECT best_match.product_id, best_match.product_name, best_match.confidence_score, best_match.matching_method;
    RETURN;
  END IF;
  
  -- Try fuzzy matching
  SELECT p.id, p.name, text_similarity(normalized_name, normalize_product_text(p.name)), 'fuzzy'::TEXT
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

-- Create triggers for updated_at (safe: drop first so re-runs succeed)
DROP TRIGGER IF EXISTS update_vendor_product_aliases_updated_at ON public.vendor_product_aliases;
CREATE TRIGGER update_vendor_product_aliases_updated_at
  BEFORE UPDATE ON public.vendor_product_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_mapping_review_queue_updated_at ON public.product_mapping_review_queue;
CREATE TRIGGER update_product_mapping_review_queue_updated_at
  BEFORE UPDATE ON public.product_mapping_review_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_mapping_stats_updated_at ON public.product_mapping_stats;
CREATE TRIGGER update_product_mapping_stats_updated_at
  BEFORE UPDATE ON public.product_mapping_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for new tables (safe: skip if exists)
CREATE INDEX IF NOT EXISTS idx_vendor_product_aliases_supplier_id ON public.vendor_product_aliases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_vendor_product_aliases_product_id ON public.vendor_product_aliases(product_id);
CREATE INDEX IF NOT EXISTS idx_vendor_product_aliases_normalized_name ON public.vendor_product_aliases(normalized_name);
CREATE INDEX IF NOT EXISTS idx_product_mapping_review_queue_status ON public.product_mapping_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_product_mapping_review_queue_created_at ON public.product_mapping_review_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_product_mapping_stats_date_company ON public.product_mapping_stats(date, company_id);

-- Add foreign key constraint for company_id on products (skip if already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_products_company_id'
      AND table_name = 'products'
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT fk_products_company_id
      FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
END $$;

-- Add foreign key constraint for company_id on suppliers (skip if already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_suppliers_company_id'
      AND table_name = 'suppliers'
  ) THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT fk_suppliers_company_id
      FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
END $$;

-- Set NOT NULL on company_id for products (safe: already a no-op if it's already NOT NULL)
ALTER TABLE public.products ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.suppliers ALTER COLUMN company_id SET NOT NULL;

-- ============================================================
-- supabase/migrations/20260513000000_add_semantic_vector_search.sql
-- ============================================================
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

-- ============================================================
-- supabase/migrations/20260515000000_phase2_product_normalization.sql
-- ============================================================
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

-- ============================================================
-- supabase/migrations/20260515010000_phase3_product_embeddings.sql
-- ============================================================
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

-- ============================================================
-- supabase/migrations/20260515020000_phase5_learning_system.sql
-- ============================================================
-- Phase 5: Learning System
-- Expands vendor alias intelligence and supplier-specific invoice templates.

-- ============================================================
-- 5.1: Expand vendor_product_aliases with learning columns
-- ============================================================
ALTER TABLE public.vendor_product_aliases
  ADD COLUMN IF NOT EXISTS approval_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS match_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_match_confidence DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS last_matched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS match_history JSONB DEFAULT '[]'::jsonb;

-- match_history tracks: [{confidence, matched_at, invoice_id, extracted_name}]

COMMENT ON COLUMN public.vendor_product_aliases.approval_history IS 'Array of {action, by_user_id, timestamp, previous_status} records';
COMMENT ON COLUMN public.vendor_product_aliases.match_count IS 'Number of times this alias has been matched against an invoice';
COMMENT ON COLUMN public.vendor_product_aliases.match_history IS 'Recent match events: [{confidence, matched_at, invoice_id, extracted_name}]';

-- ============================================================
-- 5.1a: Function to record an alias match event
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_alias_match(
  _supplier_id UUID,
  _vendor_product_name TEXT,
  _confidence DECIMAL(5,2),
  _extracted_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _alias RECORD;
  _entry JSONB;
BEGIN
  SELECT * INTO _alias
  FROM vendor_product_aliases
  WHERE supplier_id = _supplier_id
    AND lower(vendor_product_name) = lower(_vendor_product_name);

  IF NOT FOUND THEN
    RETURN;
  END IF;

  _entry := jsonb_build_object(
    'confidence', _confidence,
    'matched_at', now(),
    'extracted_name', COALESCE(_extracted_name, _vendor_product_name)
  );

  UPDATE vendor_product_aliases
  SET match_count = COALESCE(match_count, 0) + 1,
      last_match_confidence = _confidence,
      last_matched_at = now(),
      last_used_at = now(),
      match_history = CASE
        WHEN match_history IS NULL THEN jsonb_build_array(_entry)
        ELSE (match_history || _entry)
      END,
      -- Auto-approve after 3 successful matches with confidence >= 95
      is_approved = CASE
        WHEN is_approved = false AND COALESCE(match_count, 0) + 1 >= 3 AND _confidence >= 95
        THEN true
        ELSE is_approved
      END,
      approval_history = CASE
        WHEN is_approved = false AND COALESCE(match_count, 0) + 1 >= 3 AND _confidence >= 95
        THEN approval_history || jsonb_build_object(
          'action', 'auto_approved',
          'by_system', true,
          'timestamp', now(),
          'reason', '3+ matches at confidence >= 95'
        )
        ELSE approval_history
      END
  WHERE id = _alias.id;
END;
$$;

-- ============================================================
-- 5.1b: Function to approve/reject an alias (with history)
-- ============================================================
CREATE OR REPLACE FUNCTION public.review_alias(
  _alias_id UUID,
  _approved BOOLEAN,
  _reviewed_by UUID,
  _notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE vendor_product_aliases
  SET is_approved = _approved,
      approved_by = CASE WHEN _approved THEN _reviewed_by ELSE approved_by END,
      approval_history = approval_history || jsonb_build_object(
        'action', CASE WHEN _approved THEN 'approved' ELSE 'rejected' END,
        'by_user_id', _reviewed_by,
        'timestamp', now(),
        'notes', _notes
      )
  WHERE id = _alias_id;
END;
$$;

-- ============================================================
-- 5.1c: Function to get supplier alias reliability score
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_alias_reliability(
  _supplier_id UUID
)
RETURNS DECIMAL(5,2)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  total_aliases INTEGER;
  approved_aliases INTEGER;
  total_matches INTEGER;
  avg_confidence DECIMAL(5,2);
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_approved = true), SUM(match_count), AVG(last_match_confidence)
  INTO total_aliases, approved_aliases, total_matches, avg_confidence
  FROM vendor_product_aliases
  WHERE supplier_id = _supplier_id;

  IF total_aliases = 0 THEN
    RETURN 0;
  END IF;

  -- Weighted score: 40% approval rate + 30% match frequency + 30% avg confidence
  RETURN ROUND(
    (COALESCE(approved_aliases, 0)::DECIMAL / NULLIF(total_aliases, 0) * 40) +
    (LEAST(COALESCE(total_matches, 0)::DECIMAL / NULLIF(total_aliases, 0), 10) / 10 * 30) +
    (COALESCE(avg_confidence, 0) / 100 * 30),
    2
  );
END;
$$;

-- ============================================================
-- 5.2: Supplier-specific templates — enhance supplier_invoice_formats
-- ============================================================
ALTER TABLE public.supplier_invoice_formats
  ADD COLUMN IF NOT EXISTS column_coordinates JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS row_detection_pattern TEXT,
  ADD COLUMN IF NOT EXISTS learned_offsets JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS template_version INTEGER DEFAULT 1;

COMMENT ON COLUMN public.supplier_invoice_formats.column_coordinates IS 'Pixel or percentage positions: {product_name: {x, y, width}, batch: {x, y, width}, ...}';
COMMENT ON COLUMN public.supplier_invoice_formats.row_detection_pattern IS 'Regex or marker text that identifies the start of line items table';
COMMENT ON COLUMN public.supplier_invoice_formats.learned_offsets IS 'Field offset corrections learned from user edits: {field: {avg_offset_x, avg_offset_y, sample_count}}';

-- ============================================================
-- 5.2a: Function to merge column mappings from corrections
-- ============================================================
CREATE OR REPLACE FUNCTION public.learn_column_mapping(
  _supplier_id UUID,
  _format_type TEXT,
  _field_name TEXT,
  _detected_column TEXT,
  _confidence INTEGER DEFAULT 100
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _format RECORD;
  _mappings JSONB;
BEGIN
  SELECT * INTO _format
  FROM supplier_invoice_formats
  WHERE supplier_id = _supplier_id
    AND format_type = _format_type
  ORDER BY total_scanned DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  _mappings := COALESCE(_format.column_mappings, '{}'::jsonb);

  -- Increment the count for this field->column mapping
  IF _mappings ? _field_name THEN
    IF _mappings->_field_name ? _detected_column THEN
      _mappings := jsonb_set(
        _mappings,
        ARRAY[_field_name, _detected_column],
        to_jsonb(((_mappings->_field_name->>_detected_column)::INTEGER + 1))
      );
    ELSE
      _mappings := jsonb_set(
        _mappings,
        ARRAY[_field_name, _detected_column],
        '1'::jsonb
      );
    END IF;
  ELSE
    _mappings := jsonb_set(
      _mappings,
      ARRAY[_field_name],
      jsonb_build_object(_detected_column, 1)
    );
  END IF;

  UPDATE supplier_invoice_formats
  SET column_mappings = _mappings,
      template_version = COALESCE(template_version, 1) + 1,
      updated_at = now()
  WHERE id = _format.id;
END;
$$;

-- ============================================================
-- 5.2b: Function to suggest column mapping for a supplier
-- ============================================================
CREATE OR REPLACE FUNCTION public.suggest_column_mappings(
  _supplier_id UUID,
  _format_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  result JSONB := '{}'::jsonb;
  fmt RECORD;
  field_name TEXT;
  col_name TEXT;
  max_count INTEGER;
BEGIN
  FOR fmt IN
    SELECT column_mappings
    FROM supplier_invoice_formats
    WHERE supplier_id = _supplier_id
      AND (_format_type IS NULL OR format_type = _format_type)
    ORDER BY total_scanned DESC
    LIMIT 5
  LOOP
    IF fmt.column_mappings IS NULL THEN CONTINUE; END IF;

    FOR field_name IN SELECT jsonb_object_keys(fmt.column_mappings) LOOP
      IF result ? field_name THEN CONTINUE; END IF;

      -- Find the most-frequently-used column name for this field
      SELECT k, (v::text)::INTEGER INTO col_name, max_count
      FROM jsonb_each_text(fmt.column_mappings->field_name) AS t(k, v)
      ORDER BY (v::text)::INTEGER DESC
      LIMIT 1;

      IF col_name IS NOT NULL AND max_count > 0 THEN
        result := jsonb_set(result, ARRAY[field_name], to_jsonb(col_name));
      END IF;
    END LOOP;
  END LOOP;

  RETURN result;
END;
$$;

-- ============================================================
-- 5.3: Backfill existing aliases with empty history arrays
-- ============================================================
UPDATE public.vendor_product_aliases
SET approval_history = '[]'::jsonb
WHERE approval_history IS NULL;

UPDATE public.vendor_product_aliases
SET match_history = '[]'::jsonb
WHERE match_history IS NULL;

UPDATE public.vendor_product_aliases
SET match_count = COALESCE(usage_count, 0)
WHERE match_count IS NULL OR match_count = 0;

-- ============================================================
-- supabase/migrations/20260515030000_phase6_performance_scale.sql
-- ============================================================
-- Phase 6: Performance & Scale
-- Batch matching, queue architecture, and performance improvements.

-- ============================================================
-- 6.1: Batch product matching — single RPC call for all line items
-- ============================================================
CREATE OR REPLACE FUNCTION public.batch_match_products(
  _line_items JSONB,             -- [{product_name, ...}]
  _company_id UUID,
  _supplier_id UUID DEFAULT NULL,
  _embeddings JSONB DEFAULT NULL  -- {product_name: [embedding_array]}
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  item JSONB;
  result_item JSONB;
  results JSONB := '[]'::jsonb;
  embedding_str TEXT;
  match RECORD;
  parsed_invoice JSONB;
  inv_strength_str TEXT;
  inv_form TEXT;
  sem_candidate RECORD;
  hybrid_score DECIMAL(5,2);
  sem_best_score DECIMAL(5,2);
  sem_best_id UUID;
  sem_best_name TEXT;
  best_match RECORD;
  normalized_name TEXT;
  local_embedding vector(768);
  SEMANTIC_CAP CONSTANT DECIMAL(5,2) := 85;
  FINGERPRINT_CAP CONSTANT DECIMAL(5,2) := 90;
  FUZZY_CAP CONSTANT DECIMAL(5,2) := 85;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(_line_items)
  LOOP
    result_item := item;

    -- Parse the product name
    parsed_invoice := parse_product_text(item->>'product_name');
    normalized_name := normalize_product_text(item->>'product_name');

    -- Get embedding if available
    local_embedding := NULL;
    IF _embeddings IS NOT NULL AND _embeddings ? (item->>'product_name') THEN
      embedding_str := _embeddings->>(item->>'product_name');
      IF embedding_str IS NOT NULL AND embedding_str <> '' THEN
        BEGIN
          local_embedding := embedding_str::vector(768);
        EXCEPTION WHEN OTHERS THEN
          local_embedding := NULL;
        END;
      END IF;
    END IF;

    -- 1. Exact match
    SELECT p.id AS product_id, p.name AS product_name
    INTO best_match
    FROM products p
    WHERE p.company_id = _company_id
      AND p.is_active = true
      AND lower(trim(p.name)) = lower(trim(item->>'product_name'))
    LIMIT 1;

    IF FOUND THEN
      result_item := result_item || jsonb_build_object(
        'matched_product_id', best_match.product_id,
        'matched_product_name', best_match.product_name,
        'matching_confidence', 100,
        'matching_method', 'exact',
        'needs_review', false,
        'matching_details', jsonb_build_object('method', 'exact', 'confidence', 100, 'auto_accepted', true)
      );
      results := results || result_item;
      CONTINUE;
    END IF;

    -- 2. Alias match
    IF _supplier_id IS NOT NULL THEN
      SELECT vpa.product_id AS product_id, p.name AS product_name, vpa.confidence_score
      INTO best_match
      FROM vendor_product_aliases vpa
      JOIN products p ON p.id = vpa.product_id
      WHERE vpa.supplier_id = _supplier_id
        AND vpa.is_approved = true
        AND lower(vpa.vendor_product_name) = lower(item->>'product_name')
      LIMIT 1;

      IF FOUND THEN
        UPDATE vendor_product_aliases
        SET usage_count = usage_count + 1,
            last_used_at = now()
        WHERE supplier_id = _supplier_id
          AND is_approved = true
          AND lower(vendor_product_name) = lower(item->>'product_name');

        result_item := result_item || jsonb_build_object(
          'matched_product_id', best_match.product_id,
          'matched_product_name', best_match.product_name,
          'matching_confidence', best_match.confidence_score,
          'matching_method', 'alias',
          'needs_review', false,
          'matching_details', jsonb_build_object('method', 'alias', 'confidence', best_match.confidence_score, 'auto_accepted', true)
        );
        results := results || result_item;
        CONTINUE;
      END IF;
    END IF;

    -- 3. Semantic match with deterministic filters
    sem_best_score := 0;
    sem_best_id := NULL;
    sem_best_name := NULL;

    IF local_embedding IS NOT NULL THEN
      inv_strength_str := parsed_invoice->>'strength_str';
      inv_form := parsed_invoice->>'form';

      FOR sem_candidate IN
        SELECT p.id, p.name, p.brand, p.strength, p.form,
               cosine_distance_to_confidence(pe.embedding <=> local_embedding) AS raw_similarity
        FROM products p
        JOIN product_embeddings pe ON pe.product_id = p.id
        WHERE p.company_id = _company_id
          AND p.is_active = true
          AND (inv_strength_str IS NULL OR inv_strength_str = ''
               OR lower(trim(COALESCE(p.strength, ''))) = lower(trim(inv_strength_str)))
          AND (inv_form IS NULL OR inv_form = ''
               OR lower(trim(COALESCE(p.form, ''))) = lower(trim(inv_form)))
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

      -- Fallback to unfiltered search
      IF sem_best_id IS NULL THEN
        FOR sem_candidate IN
          SELECT p.id, p.name, p.brand, p.strength, p.form,
                 cosine_distance_to_confidence(pe.embedding <=> local_embedding) AS raw_similarity
          FROM products p
          JOIN product_embeddings pe ON pe.product_id = p.id
          WHERE p.company_id = _company_id
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

      IF sem_best_id IS NOT NULL AND sem_best_score >= 50.0 THEN
        result_item := result_item || jsonb_build_object(
          'matched_product_id', sem_best_id,
          'matched_product_name', sem_best_name,
          'matching_confidence', LEAST(sem_best_score, SEMANTIC_CAP),
          'matching_method', 'semantic',
          'needs_review', true,
          'matching_details', jsonb_build_object(
            'method', 'semantic',
            'raw_confidence', sem_best_score,
            'capped_confidence', LEAST(sem_best_score, SEMANTIC_CAP),
            'auto_accepted', false
          )
        );
        results := results || result_item;
        CONTINUE;
      END IF;
    END IF;

    -- 4. Fingerprint match
    SELECT p.id AS product_id, p.name AS product_name
    INTO best_match
    FROM products p
    WHERE p.company_id = _company_id
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
      result_item := result_item || jsonb_build_object(
        'matched_product_id', best_match.product_id,
        'matched_product_name', best_match.product_name,
        'matching_confidence', FINGERPRINT_CAP,
        'matching_method', 'fingerprint',
        'needs_review', true,
        'matching_details', jsonb_build_object(
          'method', 'fingerprint', 'raw_confidence', 95, 'capped_confidence', FINGERPRINT_CAP, 'auto_accepted', false
        )
      );
      results := results || result_item;
      CONTINUE;
    END IF;

    -- 5. Fuzzy match
    SELECT p.id AS product_id, p.name AS product_name,
           text_similarity(normalized_name, normalize_product_text(p.name)) AS confidence_score
    INTO best_match
    FROM products p
    WHERE p.company_id = _company_id
      AND p.is_active = true
      AND text_similarity(normalized_name, normalize_product_text(p.name)) >= 75.0
    ORDER BY text_similarity(normalized_name, normalize_product_text(p.name)) DESC
    LIMIT 1;

    IF FOUND THEN
      result_item := result_item || jsonb_build_object(
        'matched_product_id', best_match.product_id,
        'matched_product_name', best_match.product_name,
        'matching_confidence', LEAST(best_match.confidence_score, FUZZY_CAP),
        'matching_method', 'fuzzy',
        'needs_review', true,
        'matching_details', jsonb_build_object(
          'method', 'fuzzy', 'raw_confidence', best_match.confidence_score,
          'capped_confidence', LEAST(best_match.confidence_score, FUZZY_CAP), 'auto_accepted', false
        )
      );
      results := results || result_item;
      CONTINUE;
    END IF;

    -- No match
    result_item := result_item || jsonb_build_object(
      'matching_method', 'none',
      'matching_confidence', 0,
      'needs_review', true,
      'matching_details', jsonb_build_object('method', 'none', 'confidence', 0, 'auto_accepted', false)
    );
    results := results || result_item;
  END LOOP;

  RETURN results;
END;
$$;

-- ============================================================
-- 6.2: Invoice scan queue for async processing
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoice_scan_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  file_paths TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  priority INTEGER DEFAULT 0,
  result JSONB,
  error_message TEXT,
  stage TEXT,              -- Current pipeline stage
  stage_progress INTEGER DEFAULT 0,  -- 0-100
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
CREATE POLICY "invoice_scan_queue_select"
  ON public.invoice_scan_queue
  FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "invoice_scan_queue_insert" ON public.invoice_scan_queue;
CREATE POLICY "invoice_scan_queue_insert"
  ON public.invoice_scan_queue
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "invoice_scan_queue_service_role" ON public.invoice_scan_queue;
CREATE POLICY "invoice_scan_queue_service_role"
  ON public.invoice_scan_queue
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Queue management functions ──

-- Claim the next pending job
CREATE OR REPLACE FUNCTION public.claim_next_scan_job()
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  job RECORD;
BEGIN
  SELECT * INTO job
  FROM invoice_scan_queue
  WHERE status = 'queued'
    AND retry_count < max_retries
  ORDER BY priority DESC, queued_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN '{"claimed": false}'::jsonb;
  END IF;

  UPDATE invoice_scan_queue
  SET status = 'processing',
      started_at = now()
  WHERE id = job.id;

  RETURN jsonb_build_object(
    'claimed', true,
    'id', job.id,
    'company_id', job.company_id,
    'user_id', job.user_id,
    'file_paths', job.file_paths
  );
END;
$$;

-- Update job status
CREATE OR REPLACE FUNCTION public.update_scan_job(
  _job_id UUID,
  _status TEXT,
  _result JSONB DEFAULT NULL,
  _error TEXT DEFAULT NULL,
  _stage TEXT DEFAULT NULL,
  _stage_progress INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE invoice_scan_queue
  SET status = _status,
      result = COALESCE(_result, result),
      error_message = COALESCE(_error, error_message),
      stage = COALESCE(_stage, stage),
      stage_progress = COALESCE(_stage_progress, stage_progress),
      completed_at = CASE WHEN _status IN ('completed', 'failed') THEN now() ELSE completed_at END
  WHERE id = _job_id;
END;
$$;

-- Retry failed jobs
CREATE OR REPLACE FUNCTION public.retry_failed_scans(_company_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  retried_count INTEGER;
BEGIN
  UPDATE invoice_scan_queue
  SET status = 'queued',
      retry_count = retry_count + 1,
      error_message = NULL,
      started_at = NULL,
      completed_at = NULL
  WHERE status = 'failed'
    AND retry_count < max_retries
    AND (_company_id IS NULL OR company_id = _company_id);

  GET DIAGNOSTICS retried_count = ROW_COUNT;
  RETURN retried_count;
END;
$$;

-- ============================================================
-- supabase/migrations/20260519000000_add_import_system_tables.sql
-- ============================================================
-- Data Import System Tables
-- Phase 1.1: Core import engine tables with RLS

-- ============================================================================
-- 1. import_jobs: Tracks each import operation (audit trail)
-- ============================================================================
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

CREATE POLICY import_jobs_view_own ON public.import_jobs
  FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY import_jobs_manage_own ON public.import_jobs
  FOR ALL
  USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
         AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
              AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY import_jobs_super_admin_all ON public.import_jobs
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE INDEX idx_import_jobs_company_id ON public.import_jobs(company_id);
CREATE INDEX idx_import_jobs_status ON public.import_jobs(status);
CREATE INDEX idx_import_jobs_entity_type ON public.import_jobs(entity_type);
CREATE INDEX idx_import_jobs_created_at ON public.import_jobs(created_at DESC);
CREATE INDEX idx_import_jobs_company_status ON public.import_jobs(company_id, status, created_at DESC);

-- ============================================================================
-- 2. import_mappings: Per-field mapping with confidence scoring
-- ============================================================================
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

CREATE POLICY import_mappings_view_own ON public.import_mappings
  FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY import_mappings_manage_own ON public.import_mappings
  FOR ALL
  USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
         AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
              AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY import_mappings_super_admin_all ON public.import_mappings
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE INDEX idx_import_mappings_job_id ON public.import_mappings(job_id);
CREATE INDEX idx_import_mappings_company_id ON public.import_mappings(company_id);
CREATE INDEX idx_import_mappings_entity_type ON public.import_mappings(entity_type);

-- ============================================================================
-- 3. import_templates: Reusable mapping templates (system + company)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.import_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE, -- NULL = system template

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

-- Anyone in a company can view system templates + their own company templates
CREATE POLICY import_templates_view ON public.import_templates
  FOR SELECT
  USING (is_system = true
         OR company_id = public.get_user_company_id(auth.uid())
         OR public.is_super_admin(auth.uid()));

CREATE POLICY import_templates_manage_own ON public.import_templates
  FOR ALL
  USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
         AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
              AND company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY import_templates_super_admin_system ON public.import_templates
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE INDEX idx_import_templates_company_id ON public.import_templates(company_id);
CREATE INDEX idx_import_templates_entity_type ON public.import_templates(entity_type);
CREATE INDEX idx_import_templates_source_system ON public.import_templates(source_system);
CREATE INDEX idx_import_templates_is_system ON public.import_templates(is_system);

-- ============================================================================
-- Auto-update trigger for updated_at columns
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_import_jobs_updated_at ON public.import_jobs;
CREATE TRIGGER update_import_jobs_updated_at
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_import_templates_updated_at ON public.import_templates;
CREATE TRIGGER update_import_templates_updated_at
  BEFORE UPDATE ON public.import_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- supabase/migrations/20260519100000_seed_import_templates.sql
-- ============================================================
-- Seed system import templates for common ERP source systems
-- These templates map common ERP export column names to target ERP fields.

-- ─── Tally ───────────────────────────────────────────────────────────────────

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Tally Products',
  'Template for importing products/stock items exported from Tally ERP',
  'product',
  'tally',
  '[
    {"sourceField":"Stock Item Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"HSN","targetField":"hsn_code","isAiGenerated":false},
    {"sourceField":"Rate","targetField":"purchase_price","isAiGenerated":false},
    {"sourceField":"MRP","targetField":"mrp","isAiGenerated":false},
    {"sourceField":"GST %","targetField":"gst_percentage","isAiGenerated":false},
    {"sourceField":"Unit","targetField":"unit","isAiGenerated":false},
    {"sourceField":"Stock Group","targetField":"category","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Tally Suppliers',
  'Template for importing suppliers/vendors exported from Tally ERP',
  'supplier',
  'tally',
  '[
    {"sourceField":"Ledger Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"GSTIN","targetField":"gst_number","isAiGenerated":false},
    {"sourceField":"Contact","targetField":"contact_person","isAiGenerated":false},
    {"sourceField":"Phone","targetField":"phone","isAiGenerated":false},
    {"sourceField":"Email","targetField":"email","isAiGenerated":false},
    {"sourceField":"Drug Licence No","targetField":"drug_license_number","isAiGenerated":false},
    {"sourceField":"Address","targetField":"address","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Tally Customers',
  'Template for importing customers/debtors exported from Tally ERP',
  'customer',
  'tally',
  '[
    {"sourceField":"Ledger Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"GSTIN","targetField":"gst_number","isAiGenerated":false},
    {"sourceField":"Phone","targetField":"phone","isAiGenerated":false},
    {"sourceField":"Email","targetField":"email","isAiGenerated":false},
    {"sourceField":"Address","targetField":"address","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Tally Inventory',
  'Template for importing stock/batches exported from Tally ERP',
  'inventory_batch',
  'tally',
  '[
    {"sourceField":"Stock Item Name","targetField":"product_name","isAiGenerated":false},
    {"sourceField":"Batch No","targetField":"batch_number","isAiGenerated":false},
    {"sourceField":"Qty","targetField":"quantity","isAiGenerated":false},
    {"sourceField":"Rate","targetField":"purchase_price","isAiGenerated":false},
    {"sourceField":"MRP","targetField":"mrp","isAiGenerated":false},
    {"sourceField":"Expiry","targetField":"expiry_date","isAiGenerated":false},
    {"sourceField":"Mfg Date","targetField":"manufacturing_date","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Tally Purchase Orders',
  'Template for importing purchase invoices from Tally ERP',
  'purchase_order',
  'tally',
  '[
    {"sourceField":"Invoice No","targetField":"invoice_number","isAiGenerated":false},
    {"sourceField":"Party Name","targetField":"supplier_name","isAiGenerated":false},
    {"sourceField":"Date","targetField":"order_date","isAiGenerated":false},
    {"sourceField":"Grand Total","targetField":"total_amount","isAiGenerated":false},
    {"sourceField":"GST Amount","targetField":"gst_amount","isAiGenerated":false},
    {"sourceField":"Discount","targetField":"discount_amount","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

-- ─── SAP ─────────────────────────────────────────────────────────────────────

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'SAP Products',
  'Template for importing materials from SAP Business One',
  'product',
  'sap',
  '[
    {"sourceField":"ItemCode","targetField":"name","isAiGenerated":false},
    {"sourceField":"ItemName","targetField":"name","isAiGenerated":false},
    {"sourceField":"FrgnName","targetField":"generic_name","isAiGenerated":false},
    {"sourceField":"SalUnitMsr","targetField":"unit","isAiGenerated":false},
    {"sourceField":"ItmsGrpCod","targetField":"category","isAiGenerated":false},
    {"sourceField":"GST Tax Rate","targetField":"gst_percentage","isAiGenerated":false},
    {"sourceField":"HSN Code","targetField":"hsn_code","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'SAP Suppliers',
  'Template for importing business partners from SAP Business One',
  'supplier',
  'sap',
  '[
    {"sourceField":"CardCode","targetField":"name","isAiGenerated":false},
    {"sourceField":"CardName","targetField":"name","isAiGenerated":false},
    {"sourceField":"Phone1","targetField":"phone","isAiGenerated":false},
    {"sourceField":"E_Mail","targetField":"email","isAiGenerated":false},
    {"sourceField":"GSTIN","targetField":"gst_number","isAiGenerated":false},
    {"sourceField":"Address","targetField":"address","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

-- ─── Zoho Books ──────────────────────────────────────────────────────────────

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Zoho Products',
  'Template for importing items from Zoho Books',
  'product',
  'zoho',
  '[
    {"sourceField":"Item Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"HSN/SAC","targetField":"hsn_code","isAiGenerated":false},
    {"sourceField":"Rate","targetField":"purchase_price","isAiGenerated":false},
    {"sourceField":"Tax %","targetField":"gst_percentage","isAiGenerated":false},
    {"sourceField":"Unit","targetField":"unit","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Zoho Customers',
  'Template for importing customers from Zoho Books',
  'customer',
  'zoho',
  '[
    {"sourceField":"Customer Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"Customer Phone","targetField":"phone","isAiGenerated":false},
    {"sourceField":"Customer Email","targetField":"email","isAiGenerated":false},
    {"sourceField":"GST Treatment","targetField":"gst_number","isAiGenerated":false},
    {"sourceField":"Billing Address","targetField":"address","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Zoho Suppliers',
  'Template for importing vendors from Zoho Books',
  'supplier',
  'zoho',
  '[
    {"sourceField":"Vendor Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"Phone","targetField":"phone","isAiGenerated":false},
    {"sourceField":"Email","targetField":"email","isAiGenerated":false},
    {"sourceField":"GSTIN","targetField":"gst_number","isAiGenerated":false},
    {"sourceField":"Address","targetField":"address","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

-- ─── QuickBooks ──────────────────────────────────────────────────────────────

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'QuickBooks Products',
  'Template for importing products/services from QuickBooks',
  'product',
  'quickbooks',
  '[
    {"sourceField":"Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"Description","targetField":"composition","isAiGenerated":false},
    {"sourceField":"Sales Price","targetField":"mrp","isAiGenerated":false},
    {"sourceField":"Purchase Cost","targetField":"purchase_price","isAiGenerated":false},
    {"sourceField":"Income Account","targetField":"category","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'QuickBooks Customers',
  'Template for importing customers from QuickBooks',
  'customer',
  'quickbooks',
  '[
    {"sourceField":"Customer","targetField":"name","isAiGenerated":false},
    {"sourceField":"Phone","targetField":"phone","isAiGenerated":false},
    {"sourceField":"Email","targetField":"email","isAiGenerated":false},
    {"sourceField":"Billing Address","targetField":"address","isAiGenerated":false},
    {"sourceField":"GST Number","targetField":"gst_number","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

-- ============================================================
-- supabase/migrations/20260519150000_add_xml_file_type.sql
-- ============================================================
-- Phase 4.1 addendum: Extend file_type to include xml for Tally XML imports

ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_file_type_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_file_type_check CHECK (file_type IN ('csv','xlsx','json','xml'));

-- ============================================================
-- supabase/migrations/20260528000000_add_migration_engine.sql
-- ============================================================
-- Pharma ERP Migration Engine: Staging, Accounting Masters, Manufacturers
-- Supports: Marg XML, Tally XML migration with staging + confirm workflow

-- ============================================================================
-- 1. manufacturers: Normalized manufacturer master (currently TEXT on products)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.manufacturers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_system TEXT DEFAULT 'manual' CHECK (source_system IN ('manual','tally','marg','imported')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE public.manufacturers ENABLE ROW LEVEL SECURITY;

CREATE POLICY manufacturers_view_own ON public.manufacturers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY manufacturers_manage_own ON public.manufacturers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_manufacturers_company_id ON public.manufacturers(company_id);
CREATE INDEX idx_manufacturers_name ON public.manufacturers(company_id, name);

-- ============================================================================
-- 2. ledger_groups: Accounting group hierarchy (from Tally/Marg GROUP elements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ledger_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.ledger_groups(id) ON DELETE SET NULL,
  affects_stock BOOLEAN NOT NULL DEFAULT false,
  reserved_name TEXT,
  source_system TEXT DEFAULT 'manual' CHECK (source_system IN ('manual','tally','marg','imported')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE public.ledger_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_groups_view_own ON public.ledger_groups
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_groups_manage_own ON public.ledger_groups
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_ledger_groups_company_id ON public.ledger_groups(company_id);
CREATE INDEX idx_ledger_groups_parent_id ON public.ledger_groups(parent_id);
CREATE INDEX idx_ledger_groups_name ON public.ledger_groups(company_id, name);

-- ============================================================================
-- 3. ledgers: Accounting ledgers (suppliers, customers, GST, bank, cash, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  group_id UUID REFERENCES public.ledger_groups(id) ON DELETE SET NULL,
  ledger_type TEXT NOT NULL DEFAULT 'general' CHECK (ledger_type IN (
    'general','supplier','customer','bank','cash','gst','tax','expense','income','asset','liability'
  )),
  gst_number TEXT,
  pan_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  state TEXT,
  opening_balance NUMERIC(18,6) DEFAULT 0,
  balance_type TEXT DEFAULT 'debit' CHECK (balance_type IN ('debit','credit')),
  source_system TEXT DEFAULT 'manual' CHECK (source_system IN ('manual','tally','marg','imported')),
  source_ledger_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledgers_view_own ON public.ledgers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledgers_manage_own ON public.ledgers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_ledgers_company_id ON public.ledgers(company_id);
CREATE INDEX idx_ledgers_group_id ON public.ledgers(group_id);
CREATE INDEX idx_ledgers_type ON public.ledgers(company_id, ledger_type);
CREATE INDEX idx_ledgers_name ON public.ledgers(company_id, name);

-- ============================================================================
-- 4. gst_tax_structures: GST rate mapping from legacy tax structures
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.gst_tax_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  hsn_code TEXT,
  gst_rate NUMERIC(5,2) NOT NULL,
  cgst_rate NUMERIC(5,2) DEFAULT 0,
  sgst_rate NUMERIC(5,2) DEFAULT 0,
  igst_rate NUMERIC(5,2) DEFAULT 0,
  cess_rate NUMERIC(5,2) DEFAULT 0,
  description TEXT,
  effective_from DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gst_tax_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY gst_tax_structures_view_own ON public.gst_tax_structures
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY gst_tax_structures_manage_own ON public.gst_tax_structures
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_gst_tax_structures_company_id ON public.gst_tax_structures(company_id);
CREATE INDEX idx_gst_tax_structures_hsn ON public.gst_tax_structures(company_id, hsn_code);

-- ============================================================================
-- 5. import_sessions: Groups multiple import_jobs into a single migration session
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.import_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Migration',
  source_system TEXT NOT NULL DEFAULT 'tally' CHECK (source_system IN ('tally','marg','csv','manual')),
  file_name TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN (
    'uploaded','parsing','staging','reviewing','importing','completed','failed','rolled_back'
  )),
  parse_summary JSONB DEFAULT '{}',
  staging_summary JSONB DEFAULT '{}',
  import_summary JSONB DEFAULT '{}',
  error_log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.import_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_sessions_view_own ON public.import_sessions
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY import_sessions_manage_own ON public.import_sessions
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_import_sessions_company_id ON public.import_sessions(company_id);
CREATE INDEX idx_import_sessions_status ON public.import_sessions(status);
CREATE INDEX idx_import_sessions_created_at ON public.import_sessions(created_at DESC);

-- ============================================================================
-- 6. staging_products: Staging table for product imports
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staging_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  generic_name TEXT,
  manufacturer_name TEXT,
  category TEXT,
  hsn_code TEXT,
  unit TEXT DEFAULT 'PCS',
  mrp NUMERIC(10,2),
  purchase_price NUMERIC(10,2),
  sale_price NUMERIC(10,2),
  gst_percentage NUMERIC(5,2),
  drug_schedule TEXT DEFAULT 'none',
  composition TEXT,
  strength TEXT,
  opening_balance NUMERIC(18,6) DEFAULT 0,
  opening_value NUMERIC(18,6) DEFAULT 0,
  source_data JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','warning','imported','skipped')),
  validation_errors JSONB DEFAULT '[]',
  mapped_manufacturer_id UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staging_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY staging_products_view_own ON public.staging_products
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY staging_products_manage_own ON public.staging_products
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_staging_products_session ON public.staging_products(session_id);
CREATE INDEX idx_staging_products_company ON public.staging_products(company_id);
CREATE INDEX idx_staging_products_status ON public.staging_products(validation_status);

-- ============================================================================
-- 7. staging_ledgers: Staging table for ledger imports (suppliers, customers, GST)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staging_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  parent_group_name TEXT,
  ledger_type TEXT DEFAULT 'general' CHECK (ledger_type IN (
    'general','supplier','customer','bank','cash','gst','tax','expense','income','asset','liability','skip'
  )),
  gst_number TEXT,
  pan_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  state TEXT,
  opening_balance NUMERIC(18,6) DEFAULT 0,
  balance_type TEXT DEFAULT 'debit' CHECK (balance_type IN ('debit','credit')),
  source_data JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','warning','imported','skipped')),
  validation_errors JSONB DEFAULT '[]',
  mapped_group_id UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staging_ledgers ENABLE ROW LEVEL SECURITY;

CREATE POLICY staging_ledgers_view_own ON public.staging_ledgers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY staging_ledgers_manage_own ON public.staging_ledgers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_staging_ledgers_session ON public.staging_ledgers(session_id);
CREATE INDEX idx_staging_ledgers_company ON public.staging_ledgers(company_id);
CREATE INDEX idx_staging_ledgers_type ON public.staging_ledgers(company_id, ledger_type);
CREATE INDEX idx_staging_ledgers_status ON public.staging_ledgers(validation_status);

-- ============================================================================
-- 8. staging_batches: Staging table for batch/stock imports
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staging_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  product_name TEXT NOT NULL,
  batch_number TEXT,
  quantity NUMERIC(18,6) DEFAULT 0,
  mrp NUMERIC(10,2),
  purchase_price NUMERIC(10,2),
  expiry_date DATE,
  manufacturing_date DATE,
  supplier_name TEXT,
  godown_name TEXT,
  source_data JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','warning','imported','skipped')),
  validation_errors JSONB DEFAULT '[]',
  mapped_product_id UUID,
  mapped_supplier_id UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staging_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY staging_batches_view_own ON public.staging_batches
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY staging_batches_manage_own ON public.staging_batches
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_staging_batches_session ON public.staging_batches(session_id);
CREATE INDEX idx_staging_batches_company ON public.staging_batches(company_id);
CREATE INDEX idx_staging_batches_status ON public.staging_batches(validation_status);

-- ============================================================================
-- 9. staging_suppliers: Staging table for supplier/distributor imports
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staging_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  gst_number TEXT,
  pan_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  state TEXT,
  contact_person TEXT,
  drug_license_number TEXT,
  parent_group_name TEXT,
  source_data JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','warning','imported','skipped')),
  validation_errors JSONB DEFAULT '[]',
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staging_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY staging_suppliers_view_own ON public.staging_suppliers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY staging_suppliers_manage_own ON public.staging_suppliers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

CREATE INDEX idx_staging_suppliers_session ON public.staging_suppliers(session_id);
CREATE INDEX idx_staging_suppliers_company ON public.staging_suppliers(company_id);
CREATE INDEX idx_staging_suppliers_status ON public.staging_suppliers(validation_status);

-- ============================================================================
-- 10. Extend import_jobs: Add session_id + staging entity types
-- ============================================================================
ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_entity_type_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_entity_type_check
  CHECK (entity_type IN (
    'product','supplier','customer','inventory_batch','purchase_order','sales_order','payment',
    'ledger_group','ledger','manufacturer','gst_structure'
  ));

ALTER TABLE public.import_jobs ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.import_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_import_jobs_session_id ON public.import_jobs(session_id);

-- Extend import_templates entity types too
ALTER TABLE public.import_templates DROP CONSTRAINT IF EXISTS import_templates_entity_type_check;
ALTER TABLE public.import_templates ADD CONSTRAINT import_templates_entity_type_check
  CHECK (entity_type IN (
    'product','supplier','customer','inventory_batch','purchase_order','sales_order','payment',
    'ledger_group','ledger','manufacturer','gst_structure'
  ));

-- Extend import_mappings entity types
ALTER TABLE public.import_mappings DROP CONSTRAINT IF EXISTS import_mappings_entity_type_check;
ALTER TABLE public.import_mappings ADD CONSTRAINT import_mappings_entity_type_check
  CHECK (entity_type IN (
    'product','supplier','customer','inventory_batch','purchase_order','sales_order','payment',
    'ledger_group','ledger','manufacturer','gst_structure'
  ));

-- ============================================================================
-- 11. Add manufacturer FK to products (optional, nullable for backward compat)
-- ============================================================================
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturer_id UUID REFERENCES public.manufacturers(id);

-- ============================================================================
-- 12. Triggers for updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS update_manufacturers_updated_at ON public.manufacturers;
CREATE TRIGGER update_manufacturers_updated_at
  BEFORE UPDATE ON public.manufacturers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ledger_groups_updated_at ON public.ledger_groups;
CREATE TRIGGER update_ledger_groups_updated_at
  BEFORE UPDATE ON public.ledger_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ledgers_updated_at ON public.ledgers;
CREATE TRIGGER update_ledgers_updated_at
  BEFORE UPDATE ON public.ledgers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_import_sessions_updated_at ON public.import_sessions;
CREATE TRIGGER update_import_sessions_updated_at
  BEFORE UPDATE ON public.import_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- supabase/migrations/20260529000000_unified_ledger_system.sql
-- ============================================================
-- ============================================================================
-- Unified Ledger System for Dawa Dukan ERP
-- Inspired by: Marg ERP, Tally, SAP Business One, Oracle ERP
-- 
-- Principles:
--   1. Single ledger table for ALL parties (customer, supplier, manufacturer, etc.)
--   2. Roles assigned via ledger_roles (many-to-many)
--   3. Hierarchy via ledger_groups with materialized path
--   4. Multi-tenant by company_id with RLS
--   5. Scalable to 1M+ ledgers via indexing + path-based queries
-- ============================================================================

-- ─── ENUMS ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE ledger_group_type AS ENUM (
    'assets', 'liabilities', 'income', 'expenses', 'capital',
    'bank', 'cash', 'tax', 'sundry_debtors', 'sundry_creditors',
    'loan', 'investment', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ledger_role_type AS ENUM (
    'customer', 'supplier', 'manufacturer', 'distributor',
    'employee', 'doctor', 'bank', 'tax', 'expense', 'income', 'asset', 'liability'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE balance_type AS ENUM ('debit', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 1. LEDGER_GROUPS ─────────────────────────────────────────────────────
-- Hierarchical accounting groups. Materialized path for fast subtree queries.

CREATE TABLE IF NOT EXISTS public.ledger_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.ledger_groups(id) ON DELETE SET NULL,
  group_type ledger_group_type NOT NULL DEFAULT 'other',
  materialized_path TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  affects_stock BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  source_system TEXT DEFAULT 'manual' CHECK (source_system IN ('manual','tally','marg','imported')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, name)
);

CREATE INDEX idx_ledger_groups_company ON public.ledger_groups(company_id);
CREATE INDEX idx_ledger_groups_parent ON public.ledger_groups(parent_id);
CREATE INDEX idx_ledger_groups_path ON public.ledger_groups(company_id, materialized_path);
CREATE INDEX idx_ledger_groups_type ON public.ledger_groups(company_id, group_type);
CREATE INDEX idx_ledger_groups_active ON public.ledger_groups(company_id, is_active);

ALTER TABLE public.ledger_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_groups_view ON public.ledger_groups
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_groups_manage ON public.ledger_groups
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 2. LEDGERS ────────────────────────────────────────────────────────────
-- Unified master for ALL parties. One table replaces customers, suppliers, manufacturers, etc.

CREATE TABLE IF NOT EXISTS public.ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ledger_group_id UUID REFERENCES public.ledger_groups(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  alias TEXT,
  ledger_code TEXT, -- internal code/sku for quick lookup
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  balance_type balance_type NOT NULL DEFAULT 'debit',
  current_balance NUMERIC(18,4) NOT NULL DEFAULT 0,

  -- GST / Tax
  gst_number TEXT,
  gst_registration_type TEXT DEFAULT 'regular' CHECK (gst_registration_type IN ('regular','composition','unregistered','ecommerce')),
  pan_number TEXT,
  tax_id TEXT,

  -- Contact
  contact_person TEXT,
  phone TEXT,
  mobile TEXT,
  email TEXT,
  website TEXT,

  -- Address (JSONB for flexibility — can have multiple addresses later)
  address JSONB DEFAULT '{}',
  billing_address JSONB DEFAULT '{}',
  shipping_address JSONB DEFAULT '{}',
  city TEXT,
  state TEXT,
  pincode TEXT,
  country TEXT DEFAULT 'India',

  -- Bank (for payment integration)
  bank_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_branch TEXT,

  -- Classification
  party_type TEXT DEFAULT 'other' CHECK (party_type IN (
    'individual','proprietorship','partnership','llp','pvt_ltd','ltd','trust','other'
  )),

  -- ERP Integration
  source_system TEXT DEFAULT 'manual' CHECK (source_system IN ('manual','tally','marg','imported')),
  source_ledger_name TEXT, -- original name from import
  source_group_name TEXT,  -- original group from import
  import_metadata JSONB DEFAULT '{}',

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(company_id, name)
);

CREATE INDEX idx_ledgers_company ON public.ledgers(company_id);
CREATE INDEX idx_ledgers_group ON public.ledgers(ledger_group_id);
CREATE INDEX idx_ledgers_name ON public.ledgers(company_id, name);
CREATE INDEX idx_ledgers_code ON public.ledgers(company_id, ledger_code);
CREATE INDEX idx_ledgers_gst ON public.ledgers(company_id, gst_number);
CREATE INDEX idx_ledgers_active ON public.ledgers(company_id, is_active);
CREATE INDEX idx_ledgers_source ON public.ledgers(company_id, source_system);

-- Full-text search on name + alias
CREATE INDEX idx_ledgers_search ON public.ledgers USING gin(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(alias,'')));

ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledgers_view ON public.ledgers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledgers_manage ON public.ledgers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 3. LEDGER_ROLES ──────────────────────────────────────────────────────
-- Many-to-many: a ledger can have multiple roles (customer + supplier + manufacturer)

CREATE TABLE IF NOT EXISTS public.ledger_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role_type ledger_role_type NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ledger_id, role_type)
);

CREATE INDEX idx_ledger_roles_ledger ON public.ledger_roles(ledger_id);
CREATE INDEX idx_ledger_roles_company ON public.ledger_roles(company_id);
CREATE INDEX idx_ledger_roles_type ON public.ledger_roles(company_id, role_type);
CREATE INDEX idx_ledger_roles_primary ON public.ledger_roles(ledger_id, is_primary);

ALTER TABLE public.ledger_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_roles_view ON public.ledger_roles
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_roles_manage ON public.ledger_roles
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 4. LEDGER_BALANCES ────────────────────────────────────────────────────
-- Per-financial-year balances for accounting integration

CREATE TABLE IF NOT EXISTS public.ledger_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL, -- e.g. "2025-2026"
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  opening_balance_type balance_type NOT NULL DEFAULT 'debit',
  current_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_debit NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_credit NUMERIC(18,4) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  closing_balance_type balance_type NOT NULL DEFAULT 'debit',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ledger_id, financial_year)
);

CREATE INDEX idx_ledger_balances_ledger ON public.ledger_balances(ledger_id);
CREATE INDEX idx_ledger_balances_company ON public.ledger_balances(company_id);
CREATE INDEX idx_ledger_balances_year ON public.ledger_balances(company_id, financial_year);

ALTER TABLE public.ledger_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_balances_view ON public.ledger_balances
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_balances_manage ON public.ledger_balances
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 5. LEDGER_IMPORT_SESSIONS ──────────────────────────────────────────────
-- Tracks bulk import operations for ledgers/groups

CREATE TABLE IF NOT EXISTS public.ledger_import_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'tally' CHECK (source_system IN ('tally','marg','csv','manual')),
  file_name TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN (
    'uploaded','parsing','staging','reviewing','importing','completed','failed','rolled_back'
  )),
  groups_imported INTEGER DEFAULT 0,
  ledgers_imported INTEGER DEFAULT 0,
  groups_failed INTEGER DEFAULT 0,
  ledgers_failed INTEGER DEFAULT 0,
  duplicate_groups INTEGER DEFAULT 0,
  duplicate_ledgers INTEGER DEFAULT 0,
  error_log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ledger_import_sessions_company ON public.ledger_import_sessions(company_id);
CREATE INDEX idx_ledger_import_sessions_status ON public.ledger_import_sessions(status);

ALTER TABLE public.ledger_import_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_import_sessions_view ON public.ledger_import_sessions
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_import_sessions_manage ON public.ledger_import_sessions
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 6. STAGING_LEDGER_GROUPS ─────────────────────────────────────────────
-- Pre-import staging for groups

CREATE TABLE IF NOT EXISTS public.staging_ledger_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ledger_import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  parent_name TEXT,
  group_type TEXT DEFAULT 'other',
  materialized_path TEXT DEFAULT '',
  level INTEGER DEFAULT 0,
  affects_stock BOOLEAN DEFAULT false,
  source_data JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','imported','skipped')),
  validation_errors JSONB DEFAULT '[]',
  mapped_group_id UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_staging_ledger_groups_session ON public.staging_ledger_groups(session_id);
CREATE INDEX idx_staging_ledger_groups_status ON public.staging_ledger_groups(validation_status);

ALTER TABLE public.staging_ledger_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY staging_ledger_groups_view ON public.staging_ledger_groups
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY staging_ledger_groups_manage ON public.staging_ledger_groups
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 7. STAGING_LEDGERS ────────────────────────────────────────────────────
-- Pre-import staging for ledgers

CREATE TABLE IF NOT EXISTS public.staging_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ledger_import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  alias TEXT,
  parent_group_name TEXT,
  ledger_code TEXT,
  opening_balance NUMERIC(18,4) DEFAULT 0,
  balance_type TEXT DEFAULT 'debit',
  gst_number TEXT,
  pan_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  state TEXT,
  city TEXT,
  pincode TEXT,
  country TEXT,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  contact_person TEXT,
  role_types TEXT[] DEFAULT '{}',
  source_data JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','imported','skipped')),
  validation_errors JSONB DEFAULT '[]',
  mapped_ledger_id UUID,
  mapped_group_id UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_staging_ledgers_session ON public.staging_ledgers(session_id);
CREATE INDEX idx_staging_ledgers_status ON public.staging_ledgers(validation_status);

ALTER TABLE public.staging_ledgers ENABLE ROW LEVEL SECURITY;

CREATE POLICY staging_ledgers_view ON public.staging_ledgers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY staging_ledgers_manage ON public.staging_ledgers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── FUNCTIONS ─────────────────────────────────────────────────────────────

-- Update materialized path after group insert/update
CREATE OR REPLACE FUNCTION public.update_ledger_group_path()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.materialized_path := NEW.id::text || '.';
    NEW.level := 0;
  ELSE
    SELECT materialized_path || NEW.id::text || '.', level + 1
    INTO NEW.materialized_path, NEW.level
    FROM public.ledger_groups
    WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_group_path ON public.ledger_groups;
CREATE TRIGGER trg_ledger_group_path
  BEFORE INSERT OR UPDATE OF parent_id ON public.ledger_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_ledger_group_path();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_groups_updated ON public.ledger_groups;
CREATE TRIGGER trg_ledger_groups_updated
  BEFORE UPDATE ON public.ledger_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ledgers_updated ON public.ledgers;
CREATE TRIGGER trg_ledgers_updated
  BEFORE UPDATE ON public.ledgers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ledger_balances_updated ON public.ledger_balances;
CREATE TRIGGER trg_ledger_balances_updated
  BEFORE UPDATE ON public.ledger_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ledger_import_sessions_updated ON public.ledger_import_sessions;
CREATE TRIGGER trg_ledger_import_sessions_updated
  BEFORE UPDATE ON public.ledger_import_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: get all descendant group IDs (fast via materialized path)
CREATE OR REPLACE FUNCTION public.get_ledger_group_descendants(p_group_id UUID)
RETURNS TABLE(id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT g.id FROM public.ledger_groups g
  WHERE g.materialized_path LIKE (
    (SELECT materialized_path FROM public.ledger_groups WHERE id = p_group_id) || '%'
  )
  AND g.id != p_group_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: get all ancestor group IDs
CREATE OR REPLACE FUNCTION public.get_ledger_group_ancestors(p_group_id UUID)
RETURNS TABLE(id UUID) AS $$
DECLARE
  v_path TEXT;
BEGIN
  SELECT materialized_path INTO v_path FROM public.ledger_groups WHERE id = p_group_id;
  IF v_path IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT g.id FROM public.ledger_groups g
  WHERE v_path LIKE g.materialized_path || '%'
  AND g.id != p_group_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: auto-create ledger_roles from staging
CREATE OR REPLACE FUNCTION public.create_ledger_roles_from_staging(
  p_ledger_id UUID,
  p_company_id UUID,
  p_role_types TEXT[]
)
RETURNS VOID AS $$
DECLARE
  v_role TEXT;
BEGIN
  FOREACH v_role IN ARRAY p_role_types LOOP
    INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
    VALUES (p_ledger_id, p_company_id, v_role::public.ledger_role_type, false)
    ON CONFLICT (ledger_id, role_type) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Helper: auto-update current_balance on ledger update (basic)
CREATE OR REPLACE FUNCTION public.update_ledger_current_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Placeholder: real implementation would sum from journal entries
  NEW.current_balance := NEW.opening_balance;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledgers_balance ON public.ledgers;
CREATE TRIGGER trg_ledgers_balance
  BEFORE INSERT OR UPDATE OF opening_balance ON public.ledgers
  FOR EACH ROW EXECUTE FUNCTION public.update_ledger_current_balance();

-- Seed default system groups per company (run after company creation)
CREATE OR REPLACE FUNCTION public.seed_default_ledger_groups(p_company_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.ledger_groups (company_id, name, group_type, is_system, sort_order)
  VALUES
    (p_company_id, 'Assets', 'assets', true, 1),
    (p_company_id, 'Liabilities', 'liabilities', true, 2),
    (p_company_id, 'Income', 'income', true, 3),
    (p_company_id, 'Expenses', 'expenses', true, 4),
    (p_company_id, 'Capital Account', 'capital', true, 5),
    (p_company_id, 'Bank Accounts', 'bank', true, 6),
    (p_company_id, 'Cash-in-Hand', 'cash', true, 7),
    (p_company_id, 'Duties & Taxes', 'tax', true, 8),
    (p_company_id, 'Sundry Debtors', 'sundry_debtors', true, 9),
    (p_company_id, 'Sundry Creditors', 'sundry_creditors', true, 10),
    (p_company_id, 'Loans', 'loan', true, 11),
    (p_company_id, 'Investments', 'investment', true, 12)
  ON CONFLICT (company_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- View: ledgers with roles as array (for API convenience)
CREATE OR REPLACE VIEW public.ledgers_with_roles AS
SELECT
  l.*,
  COALESCE(
    array_agg(DISTINCT lr.role_type) FILTER (WHERE lr.role_type IS NOT NULL),
    ARRAY[]::public.ledger_role_type[]
  ) as roles,
  COALESCE(
    (SELECT lr2.role_type FROM public.ledger_roles lr2
     WHERE lr2.ledger_id = l.id AND lr2.is_primary = true LIMIT 1),
    NULL
  ) as primary_role
FROM public.ledgers l
LEFT JOIN public.ledger_roles lr ON lr.ledger_id = l.id
GROUP BY l.id;

-- RLS on view
ALTER VIEW public.ledgers_with_roles OWNER TO postgres;

-- Grant select on view
GRANT SELECT ON public.ledgers_with_roles TO authenticated;
GRANT SELECT ON public.ledgers_with_roles TO anon;

-- ============================================================
-- supabase/migrations/20260529180000_fix_unified_ledger_alter.sql
-- ============================================================
-- ============================================================================
-- Fix: Upgrade existing ledger_groups + ledgers to unified ledger system
-- The 20260529000000 migration failed because ledger_groups/ledgers already
-- existed from 20260528000000 with a simpler schema. This ALTER migration
-- adds the missing columns, creates new tables, and sets up triggers/views.
-- ============================================================================

-- ─── 1. ADD MISSING COLUMNS TO ledger_groups ────────────────────────────────

ALTER TABLE public.ledger_groups ADD COLUMN IF NOT EXISTS group_type TEXT NOT NULL DEFAULT 'other';
ALTER TABLE public.ledger_groups ADD COLUMN IF NOT EXISTS materialized_path TEXT NOT NULL DEFAULT '';
ALTER TABLE public.ledger_groups ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.ledger_groups ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.ledger_groups ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.ledger_groups ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Backfill group_type from reserved_name or name heuristics
UPDATE public.ledger_groups SET group_type = CASE
  WHEN name ILIKE '%sundry creditor%' THEN 'sundry_creditors'
  WHEN name ILIKE '%sundry debtor%' THEN 'sundry_debtors'
  WHEN name ILIKE '%bank account%' THEN 'bank'
  WHEN name ILIKE '%cash%' THEN 'cash'
  WHEN name ILIKE '%duties%' OR name ILIKE '%tax%' THEN 'tax'
  WHEN name ILIKE '%capital%' THEN 'capital'
  WHEN name ILIKE '%asset%' THEN 'assets'
  WHEN name ILIKE '%liabilit%' OR name ILIKE '%provision%' THEN 'liabilities'
  WHEN name ILIKE '%expense%' OR name ILIKE '%cost%' THEN 'expenses'
  WHEN name ILIKE '%income%' OR name ILIKE '%revenue%' OR name ILIKE '%sale%' THEN 'income'
  WHEN name ILIKE '%loan%' THEN 'loan'
  WHEN name ILIKE '%invest%' THEN 'investment'
  ELSE 'other'
END
WHERE group_type = 'other' AND group_type IS NOT NULL;

-- Drop old duplicate indexes from new migration (if they were created before failure)
DROP INDEX IF EXISTS public.idx_ledger_groups_company;
DROP INDEX IF EXISTS public.idx_ledger_groups_parent;

-- Create new indexes
CREATE INDEX IF NOT EXISTS idx_ledger_groups_path ON public.ledger_groups(company_id, materialized_path);
CREATE INDEX IF NOT EXISTS idx_ledger_groups_type ON public.ledger_groups(company_id, group_type);
CREATE INDEX IF NOT EXISTS idx_ledger_groups_active ON public.ledger_groups(company_id, is_active);

-- Update RLS policies (replace old ones)
DROP POLICY IF EXISTS ledger_groups_view_own ON public.ledger_groups;
DROP POLICY IF EXISTS ledger_groups_manage_own ON public.ledger_groups;

CREATE POLICY ledger_groups_view ON public.ledger_groups
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_groups_manage ON public.ledger_groups
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 2. ADD MISSING COLUMNS TO ledgers ──────────────────────────────────────

ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS ledger_group_id UUID REFERENCES public.ledger_groups(id) ON DELETE SET NULL;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS alias TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS ledger_code TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS current_balance NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS gst_registration_type TEXT DEFAULT 'regular' CHECK (gst_registration_type IN ('regular','composition','unregistered','ecommerce'));
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS address JSONB DEFAULT '{}';
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS billing_address JSONB DEFAULT '{}';
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS shipping_address JSONB DEFAULT '{}';
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India';
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS bank_branch TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS party_type TEXT DEFAULT 'other' CHECK (party_type IN ('individual','proprietorship','partnership','llp','pvt_ltd','ltd','trust','other'));
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS source_group_name TEXT;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS import_metadata JSONB DEFAULT '{}';

-- Migrate group_id → ledger_group_id
UPDATE public.ledgers SET ledger_group_id = group_id WHERE group_id IS NOT NULL AND ledger_group_id IS NULL;

-- Migrate old text address to JSONB address (if old address column was text)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ledgers'
    AND column_name = 'address' AND data_type = 'text'
  ) THEN
    UPDATE public.ledgers SET address = jsonb_build_object('line1', address) WHERE address IS NOT NULL AND address != '{}' AND address::text != 'null';
    ALTER TABLE public.ledgers ALTER COLUMN address TYPE JSONB USING address::jsonb;
  END IF;
END $$;

-- Drop old duplicate indexes
DROP INDEX IF EXISTS public.idx_ledgers_company;
DROP INDEX IF EXISTS public.idx_ledgers_group;
DROP INDEX IF EXISTS public.idx_ledgers_type;

-- Create new indexes
CREATE INDEX IF NOT EXISTS idx_ledgers_group ON public.ledgers(ledger_group_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_code ON public.ledgers(company_id, ledger_code);
CREATE INDEX IF NOT EXISTS idx_ledgers_gst ON public.ledgers(company_id, gst_number);
CREATE INDEX IF NOT EXISTS idx_ledgers_active ON public.ledgers(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ledgers_source ON public.ledgers(company_id, source_system);
CREATE INDEX IF NOT EXISTS idx_ledgers_search ON public.ledgers USING gin(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(alias,'')));

-- Update RLS policies
DROP POLICY IF EXISTS ledgers_view_own ON public.ledgers;
DROP POLICY IF EXISTS ledgers_manage_own ON public.ledgers;

CREATE POLICY ledgers_view ON public.ledgers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledgers_manage ON public.ledgers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 3. CREATE ledger_roles (NEW TABLE) ──────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.ledger_role_type AS ENUM (
    'customer', 'supplier', 'manufacturer', 'distributor',
    'employee', 'doctor', 'bank', 'tax', 'expense', 'income', 'asset', 'liability'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.ledger_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role_type public.ledger_role_type NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ledger_id, role_type)
);

CREATE INDEX IF NOT EXISTS idx_ledger_roles_ledger ON public.ledger_roles(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_roles_company ON public.ledger_roles(company_id);
CREATE INDEX IF NOT EXISTS idx_ledger_roles_type ON public.ledger_roles(company_id, role_type);
CREATE INDEX IF NOT EXISTS idx_ledger_roles_primary ON public.ledger_roles(ledger_id, is_primary);

ALTER TABLE public.ledger_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_roles_view ON public.ledger_roles
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_roles_manage ON public.ledger_roles
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 4. CREATE ledger_balances (NEW TABLE) ─────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.balance_type AS ENUM ('debit', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.ledger_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  opening_balance_type public.balance_type NOT NULL DEFAULT 'debit',
  current_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_debit NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_credit NUMERIC(18,4) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  closing_balance_type public.balance_type NOT NULL DEFAULT 'debit',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ledger_id, financial_year)
);

CREATE INDEX IF NOT EXISTS idx_ledger_balances_ledger ON public.ledger_balances(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_balances_company ON public.ledger_balances(company_id);
CREATE INDEX IF NOT EXISTS idx_ledger_balances_year ON public.ledger_balances(company_id, financial_year);

ALTER TABLE public.ledger_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_balances_view ON public.ledger_balances
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_balances_manage ON public.ledger_balances
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 5. CREATE ledger_import_sessions (NEW TABLE) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.ledger_import_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'tally' CHECK (source_system IN ('tally','marg','csv','manual')),
  file_name TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN (
    'uploaded','parsing','staging','reviewing','importing','completed','failed','rolled_back'
  )),
  groups_imported INTEGER DEFAULT 0,
  ledgers_imported INTEGER DEFAULT 0,
  groups_failed INTEGER DEFAULT 0,
  ledgers_failed INTEGER DEFAULT 0,
  duplicate_groups INTEGER DEFAULT 0,
  duplicate_ledgers INTEGER DEFAULT 0,
  error_log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_import_sessions_company ON public.ledger_import_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_ledger_import_sessions_status ON public.ledger_import_sessions(status);

ALTER TABLE public.ledger_import_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_import_sessions_view ON public.ledger_import_sessions
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_import_sessions_manage ON public.ledger_import_sessions
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 6. CREATE staging_ledger_groups (NEW TABLE) ────────────────────────────

CREATE TABLE IF NOT EXISTS public.staging_ledger_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ledger_import_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  parent_name TEXT,
  group_type TEXT DEFAULT 'other',
  materialized_path TEXT DEFAULT '',
  level INTEGER DEFAULT 0,
  affects_stock BOOLEAN DEFAULT false,
  source_data JSONB DEFAULT '{}',
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','imported','skipped')),
  validation_errors JSONB DEFAULT '[]',
  mapped_group_id UUID,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staging_ledger_groups_session ON public.staging_ledger_groups(session_id);
CREATE INDEX IF NOT EXISTS idx_staging_ledger_groups_status ON public.staging_ledger_groups(validation_status);

ALTER TABLE public.staging_ledger_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY staging_ledger_groups_view ON public.staging_ledger_groups
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY staging_ledger_groups_manage ON public.staging_ledger_groups
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 7. ADD MISSING COLUMNS TO staging_ledgers ───────────────────────────────

ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS alias TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS ledger_code TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS role_types TEXT[] DEFAULT '{}';
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS mapped_ledger_id UUID;
ALTER TABLE public.staging_ledgers ADD COLUMN IF NOT EXISTS mapped_group_id UUID;

-- ─── 8. FUNCTIONS & TRIGGERS ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_ledger_group_path()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.materialized_path := NEW.id::text || '.';
    NEW.level := 0;
  ELSE
    SELECT materialized_path || NEW.id::text || '.', level + 1
    INTO NEW.materialized_path, NEW.level
    FROM public.ledger_groups
    WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_group_path ON public.ledger_groups;
CREATE TRIGGER trg_ledger_group_path
  BEFORE INSERT OR UPDATE OF parent_id ON public.ledger_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_ledger_group_path();

DROP TRIGGER IF EXISTS trg_ledger_groups_updated ON public.ledger_groups;
CREATE TRIGGER trg_ledger_groups_updated
  BEFORE UPDATE ON public.ledger_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ledgers_updated ON public.ledgers;
CREATE TRIGGER trg_ledgers_updated
  BEFORE UPDATE ON public.ledgers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ledger_balances_updated ON public.ledger_balances;
CREATE TRIGGER trg_ledger_balances_updated
  BEFORE UPDATE ON public.ledger_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ledger_import_sessions_updated ON public.ledger_import_sessions;
CREATE TRIGGER trg_ledger_import_sessions_updated
  BEFORE UPDATE ON public.ledger_import_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_ledger_group_descendants(p_group_id UUID)
RETURNS TABLE(id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT g.id FROM public.ledger_groups g
  WHERE g.materialized_path LIKE (
    (SELECT materialized_path FROM public.ledger_groups WHERE id = p_group_id) || '%'
  )
  AND g.id != p_group_id;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.get_ledger_group_ancestors(p_group_id UUID)
RETURNS TABLE(id UUID) AS $$
DECLARE
  v_path TEXT;
BEGIN
  SELECT materialized_path INTO v_path FROM public.ledger_groups WHERE id = p_group_id;
  IF v_path IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT g.id FROM public.ledger_groups g
  WHERE v_path LIKE g.materialized_path || '%'
  AND g.id != p_group_id;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.create_ledger_roles_from_staging(
  p_ledger_id UUID, p_company_id UUID, p_role_types TEXT[]
)
RETURNS VOID AS $$
DECLARE
  v_role TEXT;
BEGIN
  FOREACH v_role IN ARRAY p_role_types LOOP
    INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
    VALUES (p_ledger_id, p_company_id, v_role::public.ledger_role_type, false)
    ON CONFLICT (ledger_id, role_type) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_ledger_current_balance()
RETURNS TRIGGER AS $$
BEGIN
  NEW.current_balance := NEW.opening_balance;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledgers_balance ON public.ledgers;
CREATE TRIGGER trg_ledgers_balance
  BEFORE INSERT OR UPDATE OF opening_balance ON public.ledgers
  FOR EACH ROW EXECUTE FUNCTION public.update_ledger_current_balance();

CREATE OR REPLACE FUNCTION public.seed_default_ledger_groups(p_company_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.ledger_groups (company_id, name, group_type, is_system, sort_order)
  VALUES
    (p_company_id, 'Assets', 'assets', true, 1),
    (p_company_id, 'Liabilities', 'liabilities', true, 2),
    (p_company_id, 'Income', 'income', true, 3),
    (p_company_id, 'Expenses', 'expenses', true, 4),
    (p_company_id, 'Capital Account', 'capital', true, 5),
    (p_company_id, 'Bank Accounts', 'bank', true, 6),
    (p_company_id, 'Cash-in-Hand', 'cash', true, 7),
    (p_company_id, 'Duties & Taxes', 'tax', true, 8),
    (p_company_id, 'Sundry Debtors', 'sundry_debtors', true, 9),
    (p_company_id, 'Sundry Creditors', 'sundry_creditors', true, 10),
    (p_company_id, 'Loans', 'loan', true, 11),
    (p_company_id, 'Investments', 'investment', true, 12)
  ON CONFLICT (company_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ─── 9. VIEW: ledgers_with_roles ────────────────────────────────────────────

CREATE OR REPLACE VIEW public.ledgers_with_roles AS
SELECT
  l.*,
  COALESCE(
    array_agg(DISTINCT lr.role_type) FILTER (WHERE lr.role_type IS NOT NULL),
    ARRAY[]::public.ledger_role_type[]
  ) as roles,
  COALESCE(
    (SELECT lr2.role_type FROM public.ledger_roles lr2
     WHERE lr2.ledger_id = l.id AND lr2.is_primary = true LIMIT 1),
    NULL
  ) as primary_role
FROM public.ledgers l
LEFT JOIN public.ledger_roles lr ON lr.ledger_id = l.id
GROUP BY l.id;

ALTER VIEW public.ledgers_with_roles OWNER TO postgres;
GRANT SELECT ON public.ledgers_with_roles TO authenticated;
GRANT SELECT ON public.ledgers_with_roles TO anon;

-- ─── 10. BACKFILL: Create ledger_roles from existing ledger_type ─────────────

INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary, priority)
SELECT id, company_id,
  CASE ledger_type
    WHEN 'supplier' THEN 'supplier'::public.ledger_role_type
    WHEN 'customer' THEN 'customer'::public.ledger_role_type
    WHEN 'bank' THEN 'bank'::public.ledger_role_type
    WHEN 'gst' THEN 'tax'::public.ledger_role_type
    WHEN 'tax' THEN 'tax'::public.ledger_role_type
    WHEN 'expense' THEN 'expense'::public.ledger_role_type
    WHEN 'income' THEN 'income'::public.ledger_role_type
    WHEN 'asset' THEN 'asset'::public.ledger_role_type
    WHEN 'liability' THEN 'liability'::public.ledger_role_type
    ELSE 'customer'::public.ledger_role_type
  END,
  true, 0
FROM public.ledgers
WHERE is_active = true
ON CONFLICT (ledger_id, role_type) DO NOTHING;

-- ============================================================
-- supabase/migrations/20260529190000_add_ledger_advanced_features.sql
-- ============================================================
-- ============================================================================
-- Phase 6: Advanced Ledger Features
-- 1. ledger_audit_log — who changed what, when
-- 2. Financial year closing support (closing_balance_type on ledger_balances)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ledger_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ledger_id UUID REFERENCES public.ledgers(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create','update','delete','merge','role_add','role_remove','balance_close','import')),
  old_values JSONB DEFAULT '{}',
  new_values JSONB DEFAULT '{}',
  changed_fields TEXT[] DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ledger_audit_log_company ON public.ledger_audit_log(company_id);
CREATE INDEX idx_ledger_audit_log_ledger ON public.ledger_audit_log(ledger_id);
CREATE INDEX idx_ledger_audit_log_action ON public.ledger_audit_log(company_id, action);
CREATE INDEX idx_ledger_audit_log_created ON public.ledger_audit_log(company_id, created_at DESC);

ALTER TABLE public.ledger_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_audit_log_view ON public.ledger_audit_log
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY ledger_audit_log_manage ON public.ledger_audit_log
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- Trigger: auto-log ledger changes
CREATE OR REPLACE FUNCTION public.log_ledger_audit()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_changed TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    INSERT INTO public.ledger_audit_log (company_id, ledger_id, action, new_values, description)
    VALUES (NEW.company_id, NEW.id, v_action, to_jsonb(NEW), 'Ledger created: ' || NEW.name);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    SELECT array_agg(diff.key) INTO v_changed
    FROM (
      SELECT r.key FROM jsonb_each(to_jsonb(NEW)) AS r(key, value)
      EXCEPT
      SELECT r.key FROM jsonb_each(to_jsonb(OLD)) AS r(key, value)
    ) diff;
    IF v_changed IS NOT NULL AND array_length(v_changed, 1) > 0 THEN
      INSERT INTO public.ledger_audit_log (company_id, ledger_id, action, old_values, new_values, changed_fields, description)
      VALUES (NEW.company_id, NEW.id, v_action, to_jsonb(OLD), to_jsonb(NEW), v_changed,
        'Updated ' || array_to_string(v_changed, ', ') || ' on ' || NEW.name);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    INSERT INTO public.ledger_audit_log (company_id, ledger_id, action, old_values, description)
    VALUES (OLD.company_id, OLD.id, v_action, to_jsonb(OLD), 'Ledger deleted: ' || OLD.name);
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_audit ON public.ledgers;
CREATE TRIGGER trg_ledger_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.ledgers
  FOR EACH ROW EXECUTE FUNCTION public.log_ledger_audit();

-- Function: close financial year
CREATE OR REPLACE FUNCTION public.close_financial_year(
  p_company_id UUID,
  p_financial_year TEXT
)
RETURNS TABLE(ledger_id UUID, name TEXT, closing_balance NUMERIC, closing_balance_type TEXT) AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.ledger_balances
  SET closing_balance = current_balance,
      closing_balance_type = CASE WHEN current_balance >= 0 THEN 'debit'::public.balance_type ELSE 'credit'::public.balance_type END
  WHERE company_id = p_company_id AND financial_year = p_financial_year;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.ledger_audit_log (company_id, action, description, new_values)
  VALUES (p_company_id, 'balance_close', 'Closed financial year ' || p_financial_year || ' (' || v_count || ' ledgers)',
    jsonb_build_object('financial_year', p_financial_year, 'ledgers_closed', v_count));

  RETURN QUERY
  SELECT lb.ledger_id, l.name, lb.closing_balance, lb.closing_balance_type::TEXT
  FROM public.ledger_balances lb
  JOIN public.ledgers l ON l.id = lb.ledger_id
  WHERE lb.company_id = p_company_id AND lb.financial_year = p_financial_year
  ORDER BY l.name;
END;
$$ LANGUAGE plpgsql;

-- Function: trial balance
CREATE OR REPLACE FUNCTION public.trial_balance(
  p_company_id UUID,
  p_financial_year TEXT
)
RETURNS TABLE(
  group_name TEXT,
  group_type TEXT,
  total_debit NUMERIC,
  total_credit NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(lg.name, 'Ungrouped') AS group_name,
    COALESCE(lg.group_type, 'other') AS group_type,
    SUM(CASE WHEN lb.closing_balance_type = 'debit' THEN lb.closing_balance ELSE 0 END) AS total_debit,
    SUM(CASE WHEN lb.closing_balance_type = 'credit' THEN lb.closing_balance ELSE 0 END) AS total_credit
  FROM public.ledger_balances lb
  JOIN public.ledgers l ON l.id = lb.ledger_id
  LEFT JOIN public.ledger_groups lg ON lg.id = l.ledger_group_id
  WHERE lb.company_id = p_company_id AND lb.financial_year = p_financial_year
  GROUP BY lg.name, lg.group_type
  ORDER BY lg.group_type, lg.name;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- supabase/migrations/20260602160000_add_journal_vouchers.sql
-- ============================================================
-- ============================================================================
-- Real Accounting Ledger Integration — Journal Vouchers + Auto-Post Triggers
-- Phase 1 & 2: Schema + Balance Recalculation
-- ============================================================================

-- ─── ENUMS ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE journal_reference_type AS ENUM (
    'sales_order', 'purchase_order', 'payment', 'adjustment'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 1. JOURNAL_VOUCHERS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.journal_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_type journal_reference_type NOT NULL DEFAULT 'adjustment',
  reference_id UUID,                     -- linked sales_order / purchase_order / payment id
  reference_number TEXT,                 -- invoice_number / order_number / payment ref
  narration TEXT NOT NULL DEFAULT '',
  total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_journal_vouchers_company_date ON public.journal_vouchers(company_id, date);
CREATE INDEX idx_journal_vouchers_ref ON public.journal_vouchers(reference_type, reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX idx_journal_vouchers_created ON public.journal_vouchers(created_at DESC);

ALTER TABLE public.journal_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY journal_vouchers_view ON public.journal_vouchers
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY journal_vouchers_manage ON public.journal_vouchers
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 2. JOURNAL_VOUCHER_LINES ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.journal_voucher_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES public.journal_vouchers(id) ON DELETE CASCADE,
  ledger_id UUID NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  debit_amount NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  narration TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_jvl_voucher ON public.journal_voucher_lines(voucher_id);
CREATE INDEX idx_jvl_ledger_date ON public.journal_voucher_lines(ledger_id, created_at);
CREATE INDEX idx_jvl_company ON public.journal_voucher_lines(company_id);

ALTER TABLE public.journal_voucher_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY jvl_view ON public.journal_voucher_lines
  FOR SELECT USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY jvl_manage ON public.journal_voucher_lines
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid()))
    AND company_id = public.get_user_company_id(auth.uid()));

-- ─── 3. AUGMENT EXISTING TABLES ───────────────────────────────────────────

-- Flag so counter-sale auto-payments don't double-post vouchers
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS skip_voucher_posting BOOLEAN NOT NULL DEFAULT false;

-- Optional direct ledger links (populated by triggers / app layer over time)
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS ledger_id UUID REFERENCES public.ledgers(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS ledger_id UUID REFERENCES public.ledgers(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS ledger_id UUID REFERENCES public.ledgers(id) ON DELETE SET NULL;

-- ─── 4. HELPER FUNCTIONS ──────────────────────────────────────────────────

-- Financial year for India (Apr-Mar)
CREATE OR REPLACE FUNCTION public.get_financial_year(p_date DATE)
RETURNS TEXT AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM p_date);
  v_month INTEGER := EXTRACT(MONTH FROM p_date);
BEGIN
  IF v_month >= 4 THEN
    RETURN v_year::TEXT || '-' || (v_year + 1)::TEXT;
  ELSE
    RETURN (v_year - 1)::TEXT || '-' || v_year::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get or create a system ledger under a system group
CREATE OR REPLACE FUNCTION public.get_or_create_system_ledger(
  p_company_id UUID,
  p_ledger_name TEXT,
  p_group_name TEXT,
  p_role_type TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_group_id UUID;
  v_ledger_id UUID;
BEGIN
  SET LOCAL search_path = 'public', 'extensions';
  SELECT id INTO v_group_id
  FROM public.ledger_groups
  WHERE company_id = p_company_id AND name = p_group_name AND is_system = true
  LIMIT 1;

  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id
    FROM public.ledger_groups
    WHERE company_id = p_company_id AND name = p_group_name
    LIMIT 1;
  END IF;

  IF v_group_id IS NULL THEN
    INSERT INTO public.ledger_groups (company_id, name, group_type, is_system, sort_order)
    VALUES (p_company_id, p_group_name, 'other', true, 99)
    RETURNING id INTO v_group_id;
  END IF;

  SELECT id INTO v_ledger_id
  FROM public.ledgers
  WHERE company_id = p_company_id AND name = p_ledger_name
  LIMIT 1;

  IF v_ledger_id IS NULL THEN
    INSERT INTO public.ledgers (
      company_id, ledger_group_id, name, opening_balance, balance_type,
      is_active, source_system
    ) VALUES (
      p_company_id, v_group_id, p_ledger_name, 0, 'debit', true, 'imported'
    )
    RETURNING id INTO v_ledger_id;
  END IF;

  IF p_role_type IS NOT NULL AND p_role_type IN (
    'customer','supplier','manufacturer','distributor',
    'employee','doctor','bank','tax','expense','income','asset','liability'
  ) THEN
    INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
    VALUES (v_ledger_id, p_company_id, p_role_type::public.ledger_role_type, false)
    ON CONFLICT (ledger_id, role_type) DO NOTHING;
  END IF;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.resolve_party_ledger(
  p_company_id UUID,
  p_party_name TEXT,
  p_party_type TEXT
)
RETURNS UUID AS $$
DECLARE
  v_ledger_id UUID;
  v_group_name TEXT;
  v_role TEXT;
  v_group_type TEXT;
BEGIN
  SET LOCAL search_path = 'public', 'extensions';
  IF p_party_name IS NULL OR trim(p_party_name) = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_ledger_id
  FROM public.ledgers
  WHERE company_id = p_company_id
    AND lower(name) = lower(trim(p_party_name))
  LIMIT 1;

  IF v_ledger_id IS NOT NULL THEN
    RETURN v_ledger_id;
  END IF;

  IF p_party_type = 'supplier' THEN
    v_group_name := 'Sundry Creditors';
    v_role := 'supplier';
    v_group_type := 'sundry_creditors';
  ELSE
    v_group_name := 'Sundry Debtors';
    v_role := 'customer';
    v_group_type := 'sundry_debtors';
  END IF;

  INSERT INTO public.ledgers (
    company_id, name, opening_balance, balance_type, is_active, source_system
  ) VALUES (
    p_company_id, trim(p_party_name), 0, 'debit', true, 'imported'
  )
  RETURNING id INTO v_ledger_id;

  DECLARE
    v_group_id UUID;
  BEGIN
    SELECT id INTO v_group_id FROM public.ledger_groups
    WHERE company_id = p_company_id AND name = v_group_name AND is_system = true
    LIMIT 1;
    IF v_group_id IS NULL THEN
      INSERT INTO public.ledger_groups (company_id, name, group_type, is_system, sort_order)
      VALUES (p_company_id, v_group_name, v_group_type, true, 99)
      RETURNING id INTO v_group_id;
    END IF;
    UPDATE public.ledgers SET ledger_group_id = v_group_id WHERE id = v_ledger_id;
  END;

  INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
  VALUES (v_ledger_id, p_company_id, v_role::public.ledger_role_type, true)
  ON CONFLICT (ledger_id, role_type) DO NOTHING;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql;

-- Resolve a party name to a ledger (auto-create under Sundry Debtors / Creditors if missing)
CREATE OR REPLACE FUNCTION public.resolve_party_ledger(
  p_company_id UUID,
  p_party_name TEXT,
  p_party_type TEXT
)
RETURNS UUID AS $$
DECLARE
  v_ledger_id UUID;
  v_group_name TEXT;
  v_role TEXT;
  v_group_type TEXT;
BEGIN
  IF p_party_name IS NULL OR trim(p_party_name) = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_ledger_id
  FROM public.ledgers
  WHERE company_id = p_company_id
    AND lower(name) = lower(trim(p_party_name))
  LIMIT 1;

  IF v_ledger_id IS NOT NULL THEN
    RETURN v_ledger_id;
  END IF;

  IF p_party_type = 'supplier' THEN
    v_group_name := 'Sundry Creditors';
    v_role := 'supplier';
    v_group_type := 'sundry_creditors';
  ELSE
    v_group_name := 'Sundry Debtors';
    v_role := 'customer';
    v_group_type := 'sundry_debtors';
  END IF;

  INSERT INTO public.ledgers (
    company_id, name, opening_balance, balance_type, is_active, source_system
  ) VALUES (
    p_company_id, trim(p_party_name), 0, 'debit', true, 'imported'
  )
  RETURNING id INTO v_ledger_id;

  DECLARE
    v_group_id UUID;
  BEGIN
    SELECT id INTO v_group_id FROM public.ledger_groups
    WHERE company_id = p_company_id AND name = v_group_name AND is_system = true
    LIMIT 1;
    IF v_group_id IS NULL THEN
      INSERT INTO public.ledger_groups (company_id, name, group_type, is_system, sort_order)
      VALUES (p_company_id, v_group_name, v_group_type, true, 99)
      RETURNING id INTO v_group_id;
    END IF;
    UPDATE public.ledgers SET ledger_group_id = v_group_id WHERE id = v_ledger_id;
  END;

  IF v_role IN ('customer','supplier','manufacturer','distributor',
    'employee','doctor','bank','tax','expense','income','asset','liability') THEN
    INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
    VALUES (v_ledger_id, p_company_id, v_role::public.ledger_role_type, true)
    ON CONFLICT (ledger_id, role_type) DO NOTHING;
  END IF;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql;

-- ─── 5. AUTO-POST TRIGGERS ────────────────────────────────────────────────

-- POST SALE VOUCHER
CREATE OR REPLACE FUNCTION public.post_sale_voucher()
RETURNS TRIGGER AS $$
DECLARE
  v_sales_account UUID;
  v_cash_ledger UUID;
  v_customer_ledger UUID;
  v_voucher_id UUID;
  v_fy TEXT;
  v_is_cash BOOLEAN;
BEGIN
  v_fy := public.get_financial_year(COALESCE(NEW.sale_date, CURRENT_DATE));

  -- Determine if this is a cash sale
  v_is_cash := (NEW.payment_status = 'paid' AND NEW.amount_paid >= NEW.total_amount)
    OR (NEW.payment_method IN ('cash','upi','card') AND (NEW.payment_status IS NULL OR NEW.payment_status = 'paid'));

  -- Resolve ledgers
  v_sales_account := public.get_or_create_system_ledger(NEW.company_id, 'Sales Account', 'Income', 'income');

  IF v_is_cash THEN
    v_cash_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Cash', 'Cash-in-Hand', 'cash');
  ELSE
    v_customer_ledger := public.resolve_party_ledger(NEW.company_id, NEW.customer_name, 'customer');
  END IF;

  -- Insert voucher
  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    NEW.company_id, COALESCE(NEW.sale_date, CURRENT_DATE), 'sales_order', NEW.id,
    COALESCE(NEW.invoice_number, 'Sale-' || NEW.id::TEXT),
    CASE WHEN v_is_cash THEN 'Cash sale' ELSE 'Credit sale - ' || COALESCE(NEW.customer_name, 'Unknown') END,
    NEW.total_amount, NEW.created_by
  )
  RETURNING id INTO v_voucher_id;

  -- Debit side
  IF v_is_cash THEN
    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, NEW.total_amount, 0, 'Cash / UPI / Card received');
  ELSE
    IF v_customer_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_customer_ledger, NEW.company_id, NEW.total_amount, 0, 'Receivable from ' || COALESCE(NEW.customer_name, 'customer'));
    END IF;
  END IF;

  -- Credit side (Sales Account)
  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, v_sales_account, NEW.company_id, 0, NEW.total_amount, 'Sales income');

  -- Store resolved ledger on the order for future reference
  IF NOT v_is_cash AND v_customer_ledger IS NOT NULL THEN
    UPDATE public.sales_orders SET ledger_id = v_customer_ledger WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_sale_voucher ON public.sales_orders;
CREATE TRIGGER trg_post_sale_voucher
  AFTER INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.post_sale_voucher();

-- POST PURCHASE VOUCHER
CREATE OR REPLACE FUNCTION public.post_purchase_voucher()
RETURNS TRIGGER AS $$
DECLARE
  v_purchase_account UUID;
  v_supplier_ledger UUID;
  v_voucher_id UUID;
  v_supplier_name TEXT;
BEGIN
  -- Resolve supplier name
  SELECT name INTO v_supplier_name
  FROM public.suppliers
  WHERE id = NEW.supplier_id AND company_id = NEW.company_id;

  IF v_supplier_name IS NULL THEN
    v_supplier_name := 'Supplier ' || NEW.supplier_id::TEXT;
  END IF;

  v_purchase_account := public.get_or_create_system_ledger(NEW.company_id, 'Purchase Account', 'Expenses', 'expense');
  v_supplier_ledger := public.resolve_party_ledger(NEW.company_id, v_supplier_name, 'supplier');

  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    NEW.company_id, COALESCE(NEW.order_date, CURRENT_DATE), 'purchase_order', NEW.id,
    COALESCE(NEW.invoice_number, NEW.order_number, 'PO-' || NEW.id::TEXT),
    'Purchase from ' || v_supplier_name,
    NEW.total_amount, NEW.created_by
  )
  RETURNING id INTO v_voucher_id;

  -- Debit: Purchase Account
  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, v_purchase_account, NEW.company_id, NEW.total_amount, 0, 'Purchase expense');

  -- Credit: Supplier
  IF v_supplier_ledger IS NOT NULL THEN
    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_supplier_ledger, NEW.company_id, 0, NEW.total_amount, 'Payable to ' || v_supplier_name);
    UPDATE public.purchase_orders SET ledger_id = v_supplier_ledger WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_purchase_voucher ON public.purchase_orders;
CREATE TRIGGER trg_post_purchase_voucher
  AFTER INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.post_purchase_voucher();

-- POST PAYMENT VOUCHER
CREATE OR REPLACE FUNCTION public.post_payment_voucher()
RETURNS TRIGGER AS $$
DECLARE
  v_cash_ledger UUID;
  v_bank_ledger UUID;
  v_party_ledger UUID;
  v_voucher_id UUID;
  v_method TEXT;
BEGIN
  -- Skip auto-payments from counter sales (already covered by sale voucher)
  IF NEW.skip_voucher_posting = true THEN
    RETURN NEW;
  END IF;

  v_method := COALESCE(NEW.payment_method, 'cash');

  -- Resolve cash/bank ledger based on method
  IF v_method IN ('bank_transfer', 'cheque') THEN
    v_bank_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Bank Account', 'Bank Accounts', 'bank');
  ELSE
    v_cash_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Cash', 'Cash-in-Hand', 'cash');
  END IF;

  -- Resolve party ledger
  IF NEW.party_type = 'supplier' THEN
    v_party_ledger := public.resolve_party_ledger(NEW.company_id, NEW.party_name, 'supplier');
  ELSE
    v_party_ledger := public.resolve_party_ledger(NEW.company_id, NEW.party_name, 'customer');
  END IF;

  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    NEW.company_id, COALESCE(NEW.payment_date, CURRENT_DATE), 'payment', NEW.id,
    COALESCE(NEW.reference_number, 'PAY-' || NEW.id::TEXT),
    CASE WHEN NEW.payment_type = 'received' THEN 'Payment received from ' || COALESCE(NEW.party_name, '') ELSE 'Payment made to ' || COALESCE(NEW.party_name, '') END,
    NEW.amount, NEW.created_by
  )
  RETURNING id INTO v_voucher_id;

  IF NEW.payment_type = 'received' THEN
    -- Dr Cash/Bank, Cr Customer
    IF v_bank_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_bank_ledger, NEW.company_id, NEW.amount, 0, 'Received via ' || v_method);
    ELSE
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, NEW.amount, 0, 'Received via ' || v_method);
    END IF;
    IF v_party_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_party_ledger, NEW.company_id, 0, NEW.amount, 'Customer receipt');
    END IF;
  ELSE
    -- Dr Supplier, Cr Cash/Bank
    IF v_party_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_party_ledger, NEW.company_id, NEW.amount, 0, 'Supplier payment');
    END IF;
    IF v_bank_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_bank_ledger, NEW.company_id, 0, NEW.amount, 'Paid via ' || v_method);
    ELSE
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, 0, NEW.amount, 'Paid via ' || v_method);
    END IF;
  END IF;

  IF v_party_ledger IS NOT NULL THEN
    UPDATE public.payments SET ledger_id = v_party_ledger WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_payment_voucher ON public.payments;
CREATE TRIGGER trg_post_payment_voucher
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.post_payment_voucher();

-- DELETE CASCADE VOUCHER
CREATE OR REPLACE FUNCTION public.delete_cascade_voucher()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'sales_orders' THEN
    DELETE FROM public.journal_vouchers
    WHERE reference_type = 'sales_order' AND reference_id = OLD.id AND company_id = OLD.company_id;
  ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
    DELETE FROM public.journal_vouchers
    WHERE reference_type = 'purchase_order' AND reference_id = OLD.id AND company_id = OLD.company_id;
  ELSIF TG_TABLE_NAME = 'payments' THEN
    DELETE FROM public.journal_vouchers
    WHERE reference_type = 'payment' AND reference_id = OLD.id AND company_id = OLD.company_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delete_sale_voucher ON public.sales_orders;
CREATE TRIGGER trg_delete_sale_voucher
  AFTER DELETE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.delete_cascade_voucher();

DROP TRIGGER IF EXISTS trg_delete_purchase_voucher ON public.purchase_orders;
CREATE TRIGGER trg_delete_purchase_voucher
  AFTER DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.delete_cascade_voucher();

DROP TRIGGER IF EXISTS trg_delete_payment_voucher ON public.payments;
CREATE TRIGGER trg_delete_payment_voucher
  AFTER DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.delete_cascade_voucher();

-- ─── 6. BALANCE RECALCULATION ─────────────────────────────────────────────

-- Drop old stub trigger / function
DROP TRIGGER IF EXISTS trg_ledgers_balance ON public.ledgers;
DROP FUNCTION IF EXISTS public.update_ledger_current_balance();

CREATE OR REPLACE FUNCTION public.recalculate_ledger_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_ledger_id UUID;
  v_company_id UUID;
  v_fy TEXT;
  v_total_debit NUMERIC(18,4);
  v_total_credit NUMERIC(18,4);
  v_opening NUMERIC(18,4);
  v_current NUMERIC(18,4);
BEGIN
  -- Determine affected ledger
  IF TG_OP = 'DELETE' THEN
    v_ledger_id := OLD.ledger_id;
    v_company_id := OLD.company_id;
  ELSE
    v_ledger_id := NEW.ledger_id;
    v_company_id := NEW.company_id;
  END IF;

  -- Use current date for FY; all balances run in the current FY for real-time updates.
  v_fy := public.get_financial_year(CURRENT_DATE);

  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_total_debit, v_total_credit
  FROM public.journal_voucher_lines
  WHERE ledger_id = v_ledger_id;

  -- Get opening balance for this FY
  SELECT COALESCE(opening_balance, 0) INTO v_opening
  FROM public.ledger_balances
  WHERE ledger_id = v_ledger_id AND financial_year = v_fy;

  v_current := v_opening + v_total_debit - v_total_credit;

  INSERT INTO public.ledger_balances (
    ledger_id, company_id, financial_year, opening_balance, opening_balance_type,
    current_balance, total_debit, total_credit, closing_balance, closing_balance_type
  ) VALUES (
    v_ledger_id, v_company_id, v_fy,
    COALESCE(v_opening, 0), 'debit'::public.balance_type,
    v_current, v_total_debit, v_total_credit,
    v_current,
    CASE WHEN v_current >= 0 THEN 'debit'::public.balance_type ELSE 'credit'::public.balance_type END
  )
  ON CONFLICT (ledger_id, financial_year) DO UPDATE SET
    current_balance = EXCLUDED.current_balance,
    total_debit = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    closing_balance = EXCLUDED.closing_balance,
    closing_balance_type = EXCLUDED.closing_balance_type,
    updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalculate_balance ON public.journal_voucher_lines;
CREATE TRIGGER trg_recalculate_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_voucher_lines
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_ledger_balance();

-- ─── 7. LEDGER_TRANSACTION_HISTORY VIEW ─────────────────────────────────────

CREATE OR REPLACE VIEW public.ledger_transaction_history AS
SELECT
  jvl.ledger_id,
  jv.date,
  jv.reference_type AS ref_type,
  jv.reference_number AS ref_number,
  jv.narration,
  jvl.debit_amount AS debit,
  jvl.credit_amount AS credit,
  jv.created_at,
  jv.id AS voucher_id
FROM public.journal_voucher_lines jvl
JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id
ORDER BY jv.date DESC, jv.created_at DESC;

ALTER VIEW public.ledger_transaction_history OWNER TO postgres;
GRANT SELECT ON public.ledger_transaction_history TO authenticated;

-- ─── 8. GET_LEDGER_TRANSACTIONS RPC ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ledger_transactions(
  p_ledger_id UUID,
  p_year TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  date DATE,
  ref_type TEXT,
  ref_number TEXT,
  narration TEXT,
  debit NUMERIC,
  credit NUMERIC,
  running_balance NUMERIC,
  voucher_id UUID
) AS $$
DECLARE
  v_rb NUMERIC(18,4) := 0;
  v_opening NUMERIC(18,4);
  v_fy TEXT;
BEGIN
  v_fy := COALESCE(p_year, public.get_financial_year(CURRENT_DATE));

  SELECT COALESCE(opening_balance, 0) INTO v_opening
  FROM public.ledger_balances
  WHERE ledger_id = p_ledger_id AND financial_year = v_fy;

  v_rb := COALESCE(v_opening, 0);

  RETURN QUERY
  WITH lines AS (
    SELECT
      jv.date,
      jv.reference_type::TEXT,
      jv.reference_number,
      jvl.narration,
      jvl.debit_amount,
      jvl.credit_amount,
      jv.id AS vid
    FROM public.journal_voucher_lines jvl
    JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id
    WHERE jvl.ledger_id = p_ledger_id
      AND public.get_financial_year(jv.date) = v_fy
    ORDER BY jv.date ASC, jv.created_at ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    l.date,
    l.reference_type,
    l.reference_number,
    l.narration,
    l.debit_amount,
    l.credit_amount,
    (v_rb + SUM(l.debit_amount - l.credit_amount) OVER (ORDER BY l.date ASC, l.vid ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)),
    l.vid
  FROM lines l
  ORDER BY l.date DESC, l.vid DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── 9. TRIAL BALANCE FIX ─────────────────────────────────────────────────
-- The existing trial_balance() already groups by ledger_group and sums closing_balance.
-- After backfill it will be correct automatically.

-- ─── 10. LEDGER_BALANCES_WITH_NAMES VIEW ──────────────────────────────────

CREATE OR REPLACE VIEW public.ledger_balances_with_names AS
SELECT
  l.id,
  l.company_id,
  l.name,
  l.alias,
  l.ledger_code,
  l.opening_balance,
  l.balance_type,
  lb.financial_year,
  lb.current_balance,
  lb.total_debit,
  lb.total_credit,
  lb.closing_balance,
  lb.closing_balance_type,
  COALESCE(array_agg(DISTINCT lr.role_type::text) FILTER (WHERE lr.role_type IS NOT NULL), ARRAY[]::text[]) AS roles,
  lg.name AS group_name,
  lg.group_type
FROM public.ledgers l
LEFT JOIN public.ledger_balances lb ON lb.ledger_id = l.id
LEFT JOIN public.ledger_roles lr ON lr.ledger_id = l.id
LEFT JOIN public.ledger_groups lg ON lg.id = l.ledger_group_id
GROUP BY l.id, lb.financial_year, lb.current_balance, lb.total_debit, lb.total_credit, lb.closing_balance, lb.closing_balance_type, lg.name, lg.group_type;

ALTER VIEW public.ledger_balances_with_names OWNER TO postgres;
GRANT SELECT ON public.ledger_balances_with_names TO authenticated;

-- ============================================================
-- supabase/migrations/20260602161000_backfill_vouchers.sql
-- ============================================================
-- ============================================================================
-- Backfill Journal Vouchers from Historical Sales / Purchases / Payments
-- Phase 2.2: One-time migration to populate ledger_balances with real data
-- ============================================================================

SET search_path = public, extensions;

-- Fix: recreate helper functions using TEXT instead of enum types
-- (enum types may not be in the search_path during migration execution)

CREATE OR REPLACE FUNCTION public.get_or_create_system_ledger(
  p_company_id UUID,
  p_ledger_name TEXT,
  p_group_name TEXT,
  p_role_type TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_group_id UUID;
  v_ledger_id UUID;
BEGIN
  SET LOCAL search_path = 'public', 'extensions';
  SELECT id INTO v_group_id
  FROM public.ledger_groups
  WHERE company_id = p_company_id AND name = p_group_name AND is_system = true
  LIMIT 1;

  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id
    FROM public.ledger_groups
    WHERE company_id = p_company_id AND name = p_group_name
    LIMIT 1;
  END IF;

  IF v_group_id IS NULL THEN
    INSERT INTO public.ledger_groups (company_id, name, group_type, is_system, sort_order)
    VALUES (p_company_id, p_group_name, 'other', true, 99)
    RETURNING id INTO v_group_id;
  END IF;

  SELECT id INTO v_ledger_id
  FROM public.ledgers
  WHERE company_id = p_company_id AND name = p_ledger_name
  LIMIT 1;

  IF v_ledger_id IS NULL THEN
    INSERT INTO public.ledgers (
      company_id, ledger_group_id, name, opening_balance, balance_type,
      is_active, source_system
    ) VALUES (
      p_company_id, v_group_id, p_ledger_name, 0, 'debit', true, 'imported'
    )
    RETURNING id INTO v_ledger_id;
  END IF;

  IF p_role_type IS NOT NULL AND p_role_type IN (
    'customer','supplier','manufacturer','distributor',
    'employee','doctor','bank','tax','expense','income','asset','liability'
  ) THEN
    INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
    VALUES (v_ledger_id, p_company_id, p_role_type::public.ledger_role_type, false)
    ON CONFLICT (ledger_id, role_type) DO NOTHING;
  END IF;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql SET search_path = 'public', 'extensions';

CREATE OR REPLACE FUNCTION public.resolve_party_ledger(
  p_company_id UUID,
  p_party_name TEXT,
  p_party_type TEXT
)
RETURNS UUID AS $$
DECLARE
  v_ledger_id UUID;
  v_group_name TEXT;
  v_role TEXT;
  v_group_type TEXT;
BEGIN
  SET LOCAL search_path = 'public', 'extensions';
  IF p_party_name IS NULL OR trim(p_party_name) = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_ledger_id
  FROM public.ledgers
  WHERE company_id = p_company_id
    AND lower(name) = lower(trim(p_party_name))
  LIMIT 1;

  IF v_ledger_id IS NOT NULL THEN
    RETURN v_ledger_id;
  END IF;

  IF p_party_type = 'supplier' THEN
    v_group_name := 'Sundry Creditors';
    v_role := 'supplier';
    v_group_type := 'sundry_creditors';
  ELSE
    v_group_name := 'Sundry Debtors';
    v_role := 'customer';
    v_group_type := 'sundry_debtors';
  END IF;

  INSERT INTO public.ledgers (
    company_id, name, opening_balance, balance_type, is_active, source_system
  ) VALUES (
    p_company_id, trim(p_party_name), 0, 'debit', true, 'imported'
  )
  RETURNING id INTO v_ledger_id;

  DECLARE
    v_group_id UUID;
  BEGIN
    SELECT id INTO v_group_id FROM public.ledger_groups
    WHERE company_id = p_company_id AND name = v_group_name AND is_system = true
    LIMIT 1;
    IF v_group_id IS NULL THEN
      INSERT INTO public.ledger_groups (company_id, name, group_type, is_system, sort_order)
      VALUES (p_company_id, v_group_name, v_group_type, true, 99)
      RETURNING id INTO v_group_id;
    END IF;
    UPDATE public.ledgers SET ledger_group_id = v_group_id WHERE id = v_ledger_id;
  END;

  IF v_role IN ('customer','supplier','manufacturer','distributor',
    'employee','doctor','bank','tax','expense','income','asset','liability') THEN
    INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
    VALUES (v_ledger_id, p_company_id, v_role::public.ledger_role_type, true)
    ON CONFLICT (ledger_id, role_type) DO NOTHING;
  END IF;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql;

-- Fix: log_ledger_audit() has a bug with alias — recreate before backfill
CREATE OR REPLACE FUNCTION public.log_ledger_audit()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_changed TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    INSERT INTO public.ledger_audit_log (company_id, ledger_id, action, new_values, description)
    VALUES (NEW.company_id, NEW.id, v_action, to_jsonb(NEW), 'Ledger created: ' || NEW.name);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    SELECT array_agg(diff.key) INTO v_changed
    FROM (
      SELECT r.key FROM jsonb_each(to_jsonb(NEW)) AS r(key, value)
      EXCEPT
      SELECT r.key FROM jsonb_each(to_jsonb(OLD)) AS r(key, value)
    ) diff;
    IF v_changed IS NOT NULL AND array_length(v_changed, 1) > 0 THEN
      INSERT INTO public.ledger_audit_log (company_id, ledger_id, action, old_values, new_values, changed_fields, description)
      VALUES (NEW.company_id, NEW.id, v_action, to_jsonb(OLD), to_jsonb(NEW), v_changed,
        'Updated ' || array_to_string(v_changed, ', ') || ' on ' || NEW.name);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    INSERT INTO public.ledger_audit_log (company_id, ledger_id, action, old_values, description)
    VALUES (OLD.company_id, OLD.id, v_action, to_jsonb(OLD), 'Ledger deleted: ' || OLD.name);
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Disable balance trigger during bulk backfill to avoid per-row slowness
ALTER TABLE public.journal_voucher_lines DISABLE TRIGGER trg_recalculate_balance;

-- Temporarily disable auto-post triggers so this script doesn't loop
ALTER TABLE public.sales_orders DISABLE TRIGGER trg_post_sale_voucher;
ALTER TABLE public.purchase_orders DISABLE TRIGGER trg_post_purchase_voucher;
ALTER TABLE public.payments DISABLE TRIGGER trg_post_payment_voucher;

-- ─── 1. BACKFILL SALES ────────────────────────────────────────────────────

DO $$
DECLARE
  rec RECORD;
  v_voucher_id UUID;
  v_sales_account UUID;
  v_cash_ledger UUID;
  v_customer_ledger UUID;
  v_is_cash BOOLEAN;
BEGIN
  FOR rec IN
    SELECT id, company_id, invoice_number, customer_name, total_amount, sale_date,
           payment_status, amount_paid, payment_method, created_by
    FROM public.sales_orders
    WHERE total_amount > 0
    ORDER BY created_at
  LOOP
    v_is_cash := (rec.payment_status = 'paid' AND COALESCE(rec.amount_paid,0) >= rec.total_amount)
      OR (rec.payment_method IN ('cash','upi','card') AND (rec.payment_status IS NULL OR rec.payment_status = 'paid'));

    v_sales_account := public.get_or_create_system_ledger(rec.company_id, 'Sales Account', 'Income', 'income');

    INSERT INTO public.journal_vouchers (
      company_id, date, reference_type, reference_id, reference_number,
      narration, total_amount, created_by
    ) VALUES (
      rec.company_id, COALESCE(rec.sale_date, CURRENT_DATE), 'sales_order', rec.id,
      COALESCE(rec.invoice_number, 'Sale-' || rec.id::TEXT),
      CASE WHEN v_is_cash THEN 'Cash sale (backfilled)' ELSE 'Credit sale (backfilled) - ' || COALESCE(rec.customer_name, 'Unknown') END,
      rec.total_amount, rec.created_by
    )
    RETURNING id INTO v_voucher_id;

    -- Debit side
    IF v_is_cash THEN
      v_cash_ledger := public.get_or_create_system_ledger(rec.company_id, 'Cash', 'Cash-in-Hand', 'cash');
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_cash_ledger, rec.company_id, rec.total_amount, 0, 'Cash / UPI / Card received (backfilled)');
    ELSE
      v_customer_ledger := public.resolve_party_ledger(rec.company_id, rec.customer_name, 'customer');
      IF v_customer_ledger IS NOT NULL THEN
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_customer_ledger, rec.company_id, rec.total_amount, 0, 'Receivable from ' || COALESCE(rec.customer_name, 'customer') || ' (backfilled)');
        UPDATE public.sales_orders SET ledger_id = v_customer_ledger WHERE id = rec.id;
      END IF;
    END IF;

    -- Credit side
    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_sales_account, rec.company_id, 0, rec.total_amount, 'Sales income (backfilled)');
  END LOOP;
END $$;

-- ─── 2. BACKFILL PURCHASES ────────────────────────────────────────────────

DO $$
DECLARE
  rec RECORD;
  v_voucher_id UUID;
  v_purchase_account UUID;
  v_supplier_ledger UUID;
  v_supplier_name TEXT;
BEGIN
  FOR rec IN
    SELECT po.id, po.company_id, po.order_number, po.invoice_number, po.supplier_id,
           po.total_amount, po.order_date, po.created_by
    FROM public.purchase_orders po
    WHERE po.total_amount > 0
    ORDER BY po.created_at
  LOOP
    SELECT name INTO v_supplier_name
    FROM public.suppliers
    WHERE id = rec.supplier_id AND company_id = rec.company_id;

    IF v_supplier_name IS NULL THEN
      v_supplier_name := 'Supplier ' || rec.supplier_id::TEXT;
    END IF;

    v_purchase_account := public.get_or_create_system_ledger(rec.company_id, 'Purchase Account', 'Expenses', 'expense');
    v_supplier_ledger := public.resolve_party_ledger(rec.company_id, v_supplier_name, 'supplier');

    INSERT INTO public.journal_vouchers (
      company_id, date, reference_type, reference_id, reference_number,
      narration, total_amount, created_by
    ) VALUES (
      rec.company_id, COALESCE(rec.order_date, CURRENT_DATE), 'purchase_order', rec.id,
      COALESCE(rec.invoice_number, rec.order_number, 'PO-' || rec.id::TEXT),
      'Purchase from ' || v_supplier_name || ' (backfilled)',
      rec.total_amount, rec.created_by
    )
    RETURNING id INTO v_voucher_id;

    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_purchase_account, rec.company_id, rec.total_amount, 0, 'Purchase expense (backfilled)');

    IF v_supplier_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_supplier_ledger, rec.company_id, 0, rec.total_amount, 'Payable to ' || v_supplier_name || ' (backfilled)');
      UPDATE public.purchase_orders SET ledger_id = v_supplier_ledger WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- ─── 3. BACKFILL PAYMENTS ─────────────────────────────────────────────────

DO $$
DECLARE
  rec RECORD;
  v_voucher_id UUID;
  v_cash_ledger UUID;
  v_bank_ledger UUID;
  v_party_ledger UUID;
  v_method TEXT;
BEGIN
  FOR rec IN
    SELECT id, company_id, payment_type, reference_type, reference_id, reference_number,
           party_name, party_type, amount, payment_method, payment_date, created_by,
           skip_voucher_posting
    FROM public.payments
    WHERE amount > 0 AND (skip_voucher_posting IS NULL OR skip_voucher_posting = false)
    ORDER BY created_at
  LOOP
    v_method := COALESCE(rec.payment_method, 'cash');

    IF v_method IN ('bank_transfer', 'cheque') THEN
      v_bank_ledger := public.get_or_create_system_ledger(rec.company_id, 'Bank Account', 'Bank Accounts', 'bank');
    ELSE
      v_cash_ledger := public.get_or_create_system_ledger(rec.company_id, 'Cash', 'Cash-in-Hand', 'cash');
    END IF;

    IF rec.party_type = 'supplier' THEN
      v_party_ledger := public.resolve_party_ledger(rec.company_id, rec.party_name, 'supplier');
    ELSE
      v_party_ledger := public.resolve_party_ledger(rec.company_id, rec.party_name, 'customer');
    END IF;

    INSERT INTO public.journal_vouchers (
      company_id, date, reference_type, reference_id, reference_number,
      narration, total_amount, created_by
    ) VALUES (
      rec.company_id, COALESCE(rec.payment_date, CURRENT_DATE), 'payment', rec.id,
      COALESCE(rec.reference_number, 'PAY-' || rec.id::TEXT),
      CASE WHEN rec.payment_type = 'received' THEN 'Payment received from ' || COALESCE(rec.party_name, '') || ' (backfilled)'
           ELSE 'Payment made to ' || COALESCE(rec.party_name, '') || ' (backfilled)' END,
      rec.amount, rec.created_by
    )
    RETURNING id INTO v_voucher_id;

    IF rec.payment_type = 'received' THEN
      IF v_bank_ledger IS NOT NULL THEN
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_bank_ledger, rec.company_id, rec.amount, 0, 'Received via ' || v_method || ' (backfilled)');
      ELSE
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_cash_ledger, rec.company_id, rec.amount, 0, 'Received via ' || v_method || ' (backfilled)');
      END IF;
      IF v_party_ledger IS NOT NULL THEN
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_party_ledger, rec.company_id, 0, rec.amount, 'Customer receipt (backfilled)');
      END IF;
    ELSE
      IF v_party_ledger IS NOT NULL THEN
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_party_ledger, rec.company_id, rec.amount, 0, 'Supplier payment (backfilled)');
      END IF;
      IF v_bank_ledger IS NOT NULL THEN
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_bank_ledger, rec.company_id, 0, rec.amount, 'Paid via ' || v_method || ' (backfilled)');
      ELSE
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_cash_ledger, rec.company_id, 0, rec.amount, 'Paid via ' || v_method || ' (backfilled)');
      END IF;
    END IF;

    IF v_party_ledger IS NOT NULL THEN
      UPDATE public.payments SET ledger_id = v_party_ledger WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- ─── 4. BATCH RECALCULATE ALL BALANCES ───────────────────────────────────

DO $$
DECLARE
  v_fy TEXT := public.get_financial_year(CURRENT_DATE);
BEGIN
  INSERT INTO public.ledger_balances (
    ledger_id, company_id, financial_year, opening_balance, opening_balance_type,
    current_balance, total_debit, total_credit, closing_balance, closing_balance_type
  )
  SELECT
    jvl.ledger_id,
    jvl.company_id,
    v_fy,
    COALESCE(lb.opening_balance, 0),
    COALESCE(lb.opening_balance_type, 'debit'::public.balance_type),
    COALESCE(lb.opening_balance, 0) + COALESCE(SUM(jvl.debit_amount), 0) - COALESCE(SUM(jvl.credit_amount), 0),
    COALESCE(SUM(jvl.debit_amount), 0),
    COALESCE(SUM(jvl.credit_amount), 0),
    COALESCE(lb.opening_balance, 0) + COALESCE(SUM(jvl.debit_amount), 0) - COALESCE(SUM(jvl.credit_amount), 0),
    CASE WHEN COALESCE(lb.opening_balance, 0) + COALESCE(SUM(jvl.debit_amount), 0) - COALESCE(SUM(jvl.credit_amount), 0) >= 0 THEN 'debit'::public.balance_type ELSE 'credit'::public.balance_type END
  FROM public.journal_voucher_lines jvl
  LEFT JOIN public.ledger_balances lb ON lb.ledger_id = jvl.ledger_id AND lb.financial_year = v_fy
  GROUP BY jvl.ledger_id, jvl.company_id, lb.opening_balance, lb.opening_balance_type
  ON CONFLICT (ledger_id, financial_year) DO UPDATE SET
    current_balance = EXCLUDED.current_balance,
    total_debit = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    closing_balance = EXCLUDED.closing_balance,
    closing_balance_type = EXCLUDED.closing_balance_type,
    updated_at = now();
END $$;

-- Re-enable triggers
ALTER TABLE public.journal_voucher_lines ENABLE TRIGGER trg_recalculate_balance;
ALTER TABLE public.sales_orders ENABLE TRIGGER trg_post_sale_voucher;
ALTER TABLE public.purchase_orders ENABLE TRIGGER trg_post_purchase_voucher;
ALTER TABLE public.payments ENABLE TRIGGER trg_post_payment_voucher;

-- ============================================================
-- supabase/migrations/20260602231000_fix_balance_type_cast.sql
-- ============================================================
-- Hotfix: Fix balance_type enum casts in recalculate_ledger_balance trigger
-- Error: column "closing_balance_type" is of type balance_type but expression is of type text

CREATE OR REPLACE FUNCTION public.recalculate_ledger_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_ledger_id UUID;
  v_company_id UUID;
  v_fy TEXT;
  v_total_debit NUMERIC(18,4);
  v_total_credit NUMERIC(18,4);
  v_opening NUMERIC(18,4);
  v_current NUMERIC(18,4);
BEGIN
  -- Determine affected ledger
  IF TG_OP = 'DELETE' THEN
    v_ledger_id := OLD.ledger_id;
    v_company_id := OLD.company_id;
  ELSE
    v_ledger_id := NEW.ledger_id;
    v_company_id := NEW.company_id;
  END IF;

  -- Use current date for FY; all balances run in the current FY for real-time updates.
  v_fy := public.get_financial_year(CURRENT_DATE);

  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_total_debit, v_total_credit
  FROM public.journal_voucher_lines
  WHERE ledger_id = v_ledger_id;

  -- Get opening balance for this FY
  SELECT COALESCE(opening_balance, 0) INTO v_opening
  FROM public.ledger_balances
  WHERE ledger_id = v_ledger_id AND financial_year = v_fy;

  v_current := v_opening + v_total_debit - v_total_credit;

  INSERT INTO public.ledger_balances (
    ledger_id, company_id, financial_year, opening_balance, opening_balance_type,
    current_balance, total_debit, total_credit, closing_balance, closing_balance_type
  ) VALUES (
    v_ledger_id, v_company_id, v_fy,
    COALESCE(v_opening, 0), 'debit'::public.balance_type,
    v_current, v_total_debit, v_total_credit,
    v_current,
    CASE WHEN v_current >= 0 THEN 'debit'::public.balance_type ELSE 'credit'::public.balance_type END
  )
  ON CONFLICT (ledger_id, financial_year) DO UPDATE SET
    current_balance = EXCLUDED.current_balance,
    total_debit = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    closing_balance = EXCLUDED.closing_balance,
    closing_balance_type = EXCLUDED.closing_balance_type,
    updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- supabase/migrations/20260602232000_fix_resolve_party_ledger_roles.sql
-- ============================================================
-- Hotfix: Fix resolve_party_ledger to add missing roles to existing ledgers
-- Issue: When a ledger exists (e.g., as customer) but is used in a different
-- context (e.g., as supplier), the role wasn't being added.

CREATE OR REPLACE FUNCTION public.resolve_party_ledger(
  p_company_id UUID,
  p_party_name TEXT,
  p_party_type TEXT
)
RETURNS UUID AS $$
DECLARE
  v_ledger_id UUID;
  v_group_name TEXT;
  v_role TEXT;
  v_group_type TEXT;
BEGIN
  IF p_party_name IS NULL OR trim(p_party_name) = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_ledger_id
  FROM public.ledgers
  WHERE company_id = p_company_id
    AND lower(name) = lower(trim(p_party_name))
  LIMIT 1;

  -- Determine the role for this party type
  IF p_party_type = 'supplier' THEN
    v_group_name := 'Sundry Creditors';
    v_role := 'supplier';
    v_group_type := 'sundry_creditors';
  ELSE
    v_group_name := 'Sundry Debtors';
    v_role := 'customer';
    v_group_type := 'sundry_debtors';
  END IF;

  -- If ledger exists, ensure the role is assigned
  IF v_ledger_id IS NOT NULL THEN
    IF v_role IN ('customer','supplier','manufacturer','distributor',
      'employee','doctor','bank','tax','expense','income','asset','liability') THEN
      INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
      VALUES (v_ledger_id, p_company_id, v_role::public.ledger_role_type, false)
      ON CONFLICT (ledger_id, role_type) DO NOTHING;
    END IF;
    RETURN v_ledger_id;
  END IF;

  -- Create new ledger
  INSERT INTO public.ledgers (
    company_id, name, opening_balance, balance_type, is_active, source_system
  ) VALUES (
    p_company_id, trim(p_party_name), 0, 'debit', true, 'imported'
  )
  RETURNING id INTO v_ledger_id;

  DECLARE
    v_group_id UUID;
  BEGIN
    SELECT id INTO v_group_id FROM public.ledger_groups
    WHERE company_id = p_company_id AND name = v_group_name AND is_system = true
    LIMIT 1;
    IF v_group_id IS NULL THEN
      INSERT INTO public.ledger_groups (company_id, name, group_type, is_system, sort_order)
      VALUES (p_company_id, v_group_name, v_group_type, true, 99)
      RETURNING id INTO v_group_id;
    END IF;
    UPDATE public.ledgers SET ledger_group_id = v_group_id WHERE id = v_ledger_id;
  END;

  IF v_role IN ('customer','supplier','manufacturer','distributor',
    'employee','doctor','bank','tax','expense','income','asset','liability') THEN
    INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
    VALUES (v_ledger_id, p_company_id, v_role::public.ledger_role_type, true)
    ON CONFLICT (ledger_id, role_type) DO NOTHING;
  END IF;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql;

-- Also fix the version in the backfill migration context (it's the same function signature)
-- This ensures both definitions are consistent

-- Fix any existing dual-role ledgers that may be missing roles
-- Find ledgers with journal entries but missing corresponding roles

INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
SELECT DISTINCT
  jvl.ledger_id,
  jv.company_id,
  CASE 
    WHEN jv.reference_type = 'sales_order' THEN 'customer'::public.ledger_role_type
    WHEN jv.reference_type = 'purchase_order' THEN 'supplier'::public.ledger_role_type
    ELSE 'customer'::public.ledger_role_type
  END,
  false
FROM public.journal_voucher_lines jvl
JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id
LEFT JOIN public.ledger_roles lr ON lr.ledger_id = jvl.ledger_id 
  AND lr.role_type = CASE 
    WHEN jv.reference_type = 'sales_order' THEN 'customer'::public.ledger_role_type
    WHEN jv.reference_type = 'purchase_order' THEN 'supplier'::public.ledger_role_type
    ELSE 'customer'::public.ledger_role_type
  END
WHERE lr.id IS NULL
  AND jv.reference_type IN ('sales_order', 'purchase_order')
ON CONFLICT (ledger_id, role_type) DO NOTHING;

-- ============================================================
-- supabase/migrations/20260602233000_update_ledger_view_contact_fields.sql
-- ============================================================
-- Update ledger_balances_with_names view to include contact fields
-- This enables Sales/Purchase pages to use ledgers instead of legacy tables

DROP VIEW IF EXISTS public.ledger_balances_with_names;

CREATE VIEW public.ledger_balances_with_names AS
SELECT
  l.id,
  l.company_id,
  l.name,
  l.alias,
  l.ledger_code,
  l.opening_balance,
  l.balance_type,
  l.phone,
  l.email,
  l.address,
  l.gst_number,
  l.is_active,
  l.created_at,
  l.updated_at,
  lb.financial_year,
  lb.current_balance,
  lb.total_debit,
  lb.total_credit,
  lb.closing_balance,
  lb.closing_balance_type,
  COALESCE(array_agg(DISTINCT lr.role_type::text) FILTER (WHERE lr.role_type IS NOT NULL), ARRAY[]::text[]) AS roles,
  lg.name AS group_name,
  lg.group_type
FROM public.ledgers l
LEFT JOIN public.ledger_balances lb ON lb.ledger_id = l.id
LEFT JOIN public.ledger_roles lr ON lr.ledger_id = l.id
LEFT JOIN public.ledger_groups lg ON lg.id = l.ledger_group_id
GROUP BY l.id, lb.financial_year, lb.current_balance, lb.total_debit, lb.total_credit, lb.closing_balance, lb.closing_balance_type, lg.name, lg.group_type;

ALTER VIEW public.ledger_balances_with_names OWNER TO postgres;
GRANT SELECT ON public.ledger_balances_with_names TO authenticated;
GRANT SELECT ON public.ledger_balances_with_names TO anon;

-- ============================================================
-- supabase/migrations/20260602234000_fix_party_transaction_history.sql
-- ============================================================
-- ============================================================================
-- Party Transaction History — Shows ALL business with a party (by ledger or name)
-- Fixes: Cash sales not showing in customer history, duplicate ledger issues
-- ============================================================================

-- First, update sales_orders to link to party ledger even for cash sales
-- This enables proper customer/supplier tracking without changing accounting

CREATE OR REPLACE FUNCTION public.post_sale_voucher()
RETURNS TRIGGER AS $$
DECLARE
  v_sales_account UUID;
  v_cash_ledger UUID;
  v_customer_ledger UUID;
  v_voucher_id UUID;
  v_fy TEXT;
  v_is_cash BOOLEAN;
BEGIN
  v_fy := public.get_financial_year(COALESCE(NEW.sale_date, CURRENT_DATE));

  -- Determine if this is a cash sale
  v_is_cash := (NEW.payment_status = 'paid' AND COALESCE(NEW.amount_paid,0) >= NEW.total_amount)
    OR (NEW.payment_method IN ('cash','upi','card') AND (NEW.payment_status IS NULL OR NEW.payment_status = 'paid'));

  -- Resolve ledgers
  v_sales_account := public.get_or_create_system_ledger(NEW.company_id, 'Sales Account', 'Income', 'income');

  -- ALWAYS resolve party ledger for tracking (even for cash sales)
  -- This links the sale to the customer record
  v_customer_ledger := public.resolve_party_ledger(NEW.company_id, NEW.customer_name, 'customer');

  IF v_is_cash THEN
    v_cash_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Cash', 'Cash-in-Hand', 'cash');
  END IF;

  -- Insert voucher
  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    NEW.company_id, COALESCE(NEW.sale_date, CURRENT_DATE), 'sales_order', NEW.id,
    COALESCE(NEW.invoice_number, 'Sale-' || NEW.id::TEXT),
    CASE WHEN v_is_cash THEN 'Cash sale' ELSE 'Credit sale - ' || COALESCE(NEW.customer_name, 'Unknown') END,
    NEW.total_amount, NEW.created_by
  )
  RETURNING id INTO v_voucher_id;

  -- Debit side
  IF v_is_cash THEN
    -- Cash sale: Debit Cash (accounting entry)
    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, NEW.total_amount, 0, 'Cash / UPI / Card received');
    
    -- Also record receivable from customer for tracking (immediately cleared)
    IF v_customer_ledger IS NOT NULL THEN
      -- Debit Customer (tracking entry - reversed immediately by cash)
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_customer_ledger, NEW.company_id, 0, NEW.total_amount, 'Cash sale to ' || COALESCE(NEW.customer_name, 'customer') || ' (tracking)');
    END IF;
  ELSE
    -- Credit sale: Debit Customer
    IF v_customer_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_customer_ledger, NEW.company_id, NEW.total_amount, 0, 'Receivable from ' || COALESCE(NEW.customer_name, 'customer'));
    END IF;
  END IF;

  -- Credit side (Sales Account) - always present
  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, v_sales_account, NEW.company_id, 0, NEW.total_amount, 'Sales income');

  -- Store resolved ledger on the order for future reference
  IF v_customer_ledger IS NOT NULL THEN
    UPDATE public.sales_orders SET ledger_id = v_customer_ledger WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_post_sale_voucher ON public.sales_orders;
CREATE TRIGGER trg_post_sale_voucher
  AFTER INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.post_sale_voucher();

-- ============================================================================
-- NEW: Party Transaction History View
-- Shows ALL transactions with a party, including:
-- - Credit sales (where party ledger is debited)
-- - Cash sales (where party ledger has tracking entry)
-- - Purchases (where party ledger is credited)
-- - Payments (received from/made to party)
-- ============================================================================

CREATE OR REPLACE VIEW public.party_transaction_history AS
SELECT
  l.id AS ledger_id,
  l.name AS party_name,
  jv.id AS voucher_id,
  jv.date,
  jv.reference_type AS ref_type,
  jv.reference_id,
  jv.reference_number AS ref_number,
  jv.narration,
  jvl.debit_amount AS debit,
  jvl.credit_amount AS credit,
  jv.created_at,
  -- Running balance for this ledger
  l.current_balance AS ledger_current_balance
FROM public.journal_voucher_lines jvl
JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id
JOIN public.ledgers l ON l.id = jvl.ledger_id
WHERE jvl.ledger_id IN (
  -- Only include party ledgers (ledgers with roles)
  SELECT DISTINCT ledger_id FROM public.ledger_roles
)
ORDER BY jv.date DESC, jv.created_at DESC;

ALTER VIEW public.party_transaction_history OWNER TO postgres;
GRANT SELECT ON public.party_transaction_history TO authenticated;

-- ============================================================================
-- NEW: RPC to get unified party transactions
-- Takes a ledger_id and returns all transactions with that party
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_party_transactions(
  p_ledger_id UUID,
  p_year TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  date DATE,
  ref_type TEXT,
  ref_number TEXT,
  narration TEXT,
  debit NUMERIC,
  credit NUMERIC,
  running_balance NUMERIC,
  voucher_id UUID
) AS $$
DECLARE
  v_rb NUMERIC(18,4) := 0;
  v_opening NUMERIC(18,4);
  v_fy TEXT;
BEGIN
  v_fy := COALESCE(p_year, public.get_financial_year(CURRENT_DATE));

  SELECT COALESCE(opening_balance, 0) INTO v_opening
  FROM public.ledger_balances
  WHERE ledger_id = p_ledger_id AND financial_year = v_fy;

  v_rb := COALESCE(v_opening, 0);

  RETURN QUERY
  WITH lines AS (
    SELECT
      jv.date,
      jv.reference_type::TEXT,
      jv.reference_number,
      jvl.narration,
      jvl.debit_amount,
      jvl.credit_amount,
      jv.id AS vid
    FROM public.journal_voucher_lines jvl
    JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id
    WHERE jvl.ledger_id = p_ledger_id
      AND public.get_financial_year(jv.date) = v_fy
      -- Exclude pure tracking entries (cash sales have both cash and party entries)
      AND NOT jvl.narration LIKE '%(tracking)%'
    ORDER BY jv.date ASC, jv.created_at ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    l.date,
    l.reference_type,
    l.reference_number,
    l.narration,
    l.debit_amount,
    l.credit_amount,
    (v_rb + SUM(l.debit_amount - l.credit_amount) OVER (ORDER BY l.date ASC, l.vid ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)),
    l.vid
  FROM lines l
  ORDER BY l.date DESC, l.vid DESC;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_party_transactions(UUID, TEXT, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- Backfill: Fix past cash sales to link to party ledger
-- Update sales_orders.ledger_id for all cash sales where it's NULL
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
  v_ledger_id UUID;
BEGIN
  FOR rec IN
    SELECT so.id, so.company_id, so.customer_name
    FROM public.sales_orders so
    WHERE so.ledger_id IS NULL
      AND so.customer_name IS NOT NULL
      AND so.total_amount > 0
  LOOP
    -- Try to find matching ledger
    SELECT l.id INTO v_ledger_id
    FROM public.ledgers l
    WHERE l.company_id = rec.company_id
      AND lower(l.name) = lower(trim(rec.customer_name))
    LIMIT 1;
    
    -- If found, update the sale
    IF v_ledger_id IS NOT NULL THEN
      UPDATE public.sales_orders 
      SET ledger_id = v_ledger_id 
      WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- Fix: Merge duplicate ledgers for the same party
-- This consolidates ledgers with similar names
-- ============================================================================

-- Function to find potential duplicate ledgers
CREATE OR REPLACE FUNCTION public.find_duplicate_ledgers(p_company_id UUID)
RETURNS TABLE(
  canonical_name TEXT,
  duplicate_count BIGINT,
  ledger_ids UUID[],
  total_debit NUMERIC,
  total_credit NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH ledger_activity AS (
    SELECT 
      l.id,
      lower(regexp_replace(l.name, '\\s+(pvt\.?|ltd\.?|private|limited|llp|inc\.?).*$', '', 'i')) as normalized_name,
      COALESCE(SUM(jvl.debit_amount), 0) as debit,
      COALESCE(SUM(jvl.credit_amount), 0) as credit
    FROM public.ledgers l
    LEFT JOIN public.journal_voucher_lines jvl ON jvl.ledger_id = l.id
    WHERE l.company_id = p_company_id
    GROUP BY l.id, l.name
  )
  SELECT 
    la.normalized_name as canonical_name,
    COUNT(*) as duplicate_count,
    array_agg(la.id) as ledger_ids,
    SUM(la.debit) as total_debit,
    SUM(la.credit) as total_credit
  FROM ledger_activity la
  GROUP BY la.normalized_name
  HAVING COUNT(*) > 1
  ORDER BY SUM(la.debit + la.credit) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.find_duplicate_ledgers(UUID) TO authenticated;

-- ============================================================
-- supabase/migrations/20260604162000_create_ledger_merge_function.sql
-- ============================================================
-- ============================================================================
-- Ledger Merge Function — Consolidates duplicate party ledgers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merge_ledgers(
  p_source_ledger_id UUID,
  p_target_ledger_id UUID,
  p_company_id UUID,
  p_merged_by UUID DEFAULT NULL
)
RETURNS TABLE(
  source_name TEXT,
  target_name TEXT,
  transactions_moved INTEGER,
  orders_updated INTEGER,
  payments_updated INTEGER,
  roles_merged INTEGER,
  balance_transferred NUMERIC
) AS $$
DECLARE
  v_source_name TEXT;
  v_target_name TEXT;
  v_transactions_moved INTEGER := 0;
  v_orders_updated INTEGER := 0;
  v_payments_updated INTEGER := 0;
  v_roles_merged INTEGER := 0;
  v_source_balance NUMERIC := 0;
  v_target_balance NUMERIC := 0;
  v_row_count INTEGER;
BEGIN
  -- Validate inputs
  IF p_source_ledger_id = p_target_ledger_id THEN
    RAISE EXCEPTION 'Source and target ledger cannot be the same';
  END IF;

  -- Get ledger names for logging
  SELECT name INTO v_source_name FROM public.ledgers WHERE id = p_source_ledger_id AND company_id = p_company_id;
  SELECT name INTO v_target_name FROM public.ledgers WHERE id = p_target_ledger_id AND company_id = p_company_id;
  
  IF v_source_name IS NULL THEN
    RAISE EXCEPTION 'Source ledger not found or does not belong to company';
  END IF;
  IF v_target_name IS NULL THEN
    RAISE EXCEPTION 'Target ledger not found or does not belong to company';
  END IF;

  -- 1. Move journal voucher lines (update ledger_id from source to target)
  UPDATE public.journal_voucher_lines
  SET ledger_id = p_target_ledger_id
  WHERE ledger_id = p_source_ledger_id
    AND company_id = p_company_id;
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_transactions_moved := v_row_count;

  -- 2. Update sales_orders to point to target ledger
  UPDATE public.sales_orders
  SET ledger_id = p_target_ledger_id
  WHERE ledger_id = p_source_ledger_id
    AND company_id = p_company_id;
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_orders_updated := v_orders_updated + v_row_count;

  -- 3. Update purchase_orders
  UPDATE public.purchase_orders
  SET ledger_id = p_target_ledger_id
  WHERE ledger_id = p_source_ledger_id
    AND company_id = p_company_id;
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_orders_updated := v_orders_updated + v_row_count;

  -- 4. Update payments
  UPDATE public.payments
  SET ledger_id = p_target_ledger_id
  WHERE ledger_id = p_source_ledger_id
    AND company_id = p_company_id;
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_payments_updated := v_row_count;

  -- 5. Merge roles — add any roles from source that target doesn't have
  INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary, priority)
  SELECT 
    p_target_ledger_id,
    p_company_id,
    sr.role_type,
    false, -- Not primary for merged roles
    (SELECT COALESCE(MAX(priority), 0) + 1 FROM public.ledger_roles WHERE ledger_id = p_target_ledger_id)
  FROM public.ledger_roles sr
  WHERE sr.ledger_id = p_source_ledger_id
    AND sr.company_id = p_company_id
    AND NOT EXISTS (
      SELECT 1 FROM public.ledger_roles tr
      WHERE tr.ledger_id = p_target_ledger_id
        AND tr.role_type = sr.role_type
    );
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_roles_merged := v_row_count;

  -- 6. Get balance info for logging
  SELECT COALESCE(current_balance, 0) INTO v_source_balance
  FROM public.ledger_balances
  WHERE ledger_id = p_source_ledger_id
    AND financial_year = public.get_financial_year(CURRENT_DATE);
  
  SELECT COALESCE(current_balance, 0) INTO v_target_balance
  FROM public.ledger_balances
  WHERE ledger_id = p_target_ledger_id
    AND financial_year = public.get_financial_year(CURRENT_DATE);

  -- 7. Log to audit
  INSERT INTO public.ledger_audit_log (
    company_id,
    ledger_id,
    action,
    old_values,
    new_values,
    description,
    performed_by
  ) VALUES (
    p_company_id,
    p_target_ledger_id,
    'merge',
    jsonb_build_object(
      'source_ledger_id', p_source_ledger_id,
      'source_name', v_source_name,
      'source_balance', v_source_balance,
      'target_ledger_id', p_target_ledger_id,
      'target_name', v_target_name,
      'target_balance_before', v_target_balance
    ),
    jsonb_build_object(
      'target_ledger_id', p_target_ledger_id,
      'transactions_moved', v_transactions_moved,
      'orders_updated', v_orders_updated,
      'payments_updated', v_payments_updated,
      'roles_merged', v_roles_merged
    ),
    format('Merged ledger "%s" (ID: %s, balance: %s) into "%s" (ID: %s)', 
           v_source_name, p_source_ledger_id, v_source_balance,
           v_target_name, p_target_ledger_id),
    p_merged_by
  );

  -- 8. Deactivate source ledger (don't delete — preserve history)
  UPDATE public.ledgers
  SET 
    is_active = false,
    name = v_source_name || ' [MERGED into ' || v_target_name || ']', -- Rename to indicate merge
    updated_at = now()
  WHERE id = p_source_ledger_id
    AND company_id = p_company_id;

  -- Return summary
  RETURN QUERY SELECT 
    v_source_name,
    v_target_name,
    v_transactions_moved,
    v_orders_updated,
    v_payments_updated,
    v_roles_merged,
    v_source_balance;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.merge_ledgers(UUID, UUID, UUID, UUID) TO authenticated;

-- ============================================================================
-- Bulk Merge Duplicates Function
-- Uses find_duplicate_ledgers to merge all duplicates automatically
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_merge_duplicate_ledgers(
  p_company_id UUID,
  p_merged_by UUID DEFAULT NULL,
  p_dry_run BOOLEAN DEFAULT true -- If true, only returns what WOULD be merged
)
RETURNS TABLE(
  canonical_name TEXT,
  kept_ledger_id UUID,
  kept_ledger_name TEXT,
  merged_ledger_id UUID,
  merged_ledger_name TEXT,
  transactions_moved INTEGER,
  orders_updated INTEGER,
  payments_updated INTEGER,
  status TEXT
) AS $$
DECLARE
  v_duplicate RECORD;
  v_canonical_ledger_id UUID;
  v_duplicate_ledger_id UUID;
  v_merge_result RECORD;
  v_row_count INTEGER;
BEGIN
  -- Iterate through all duplicates found by find_duplicate_ledgers
  FOR v_duplicate IN
    SELECT * FROM public.find_duplicate_ledgers(p_company_id)
  LOOP
    -- Pick the "canonical" ledger (first in array, or the one with most roles, or most activity)
    -- Strategy: Pick the one with both customer+supplier roles, or most transactions
    
    SELECT l.id INTO v_canonical_ledger_id
    FROM unnest(v_duplicate.ledger_ids) AS lid
    JOIN public.ledgers l ON l.id = lid
    LEFT JOIN public.ledger_roles lr ON lr.ledger_id = lid
    GROUP BY l.id
    ORDER BY 
      -- Prioritize ledgers with both customer and supplier roles
      COUNT(DISTINCT CASE WHEN lr.role_type IN ('customer', 'supplier') THEN lr.role_type END) DESC,
      -- Then by total transaction volume
      (SELECT COUNT(*) FROM public.journal_voucher_lines jvl WHERE jvl.ledger_id = lid) DESC
    LIMIT 1;

    -- Merge all others into the canonical
    FOR v_duplicate_ledger_id IN
      SELECT unnest(v_duplicate.ledger_ids)
      WHERE unnest(v_duplicate.ledger_ids) != v_canonical_ledger_id
    LOOP
      IF p_dry_run THEN
        -- Just return what would happen
        RETURN QUERY SELECT
          v_duplicate.canonical_name,
          v_canonical_ledger_id,
          (SELECT name FROM public.ledgers WHERE id = v_canonical_ledger_id),
          v_duplicate_ledger_id,
          (SELECT name FROM public.ledgers WHERE id = v_duplicate_ledger_id),
          0::INTEGER, -- transactions
          0::INTEGER, -- orders
          0::INTEGER, -- payments
          'WOULD_MERGE'::TEXT;
      ELSE
        -- Actually perform the merge
        BEGIN
          SELECT * INTO v_merge_result
          FROM public.merge_ledgers(
            v_duplicate_ledger_id,
            v_canonical_ledger_id,
            p_company_id,
            p_merged_by
          );
          
          RETURN QUERY SELECT
            v_duplicate.canonical_name,
            v_canonical_ledger_id,
            v_merge_result.target_name,
            v_duplicate_ledger_id,
            v_merge_result.source_name,
            v_merge_result.transactions_moved,
            v_merge_result.orders_updated,
            v_merge_result.payments_updated,
            'MERGED'::TEXT;
            
        EXCEPTION WHEN OTHERS THEN
          RETURN QUERY SELECT
            v_duplicate.canonical_name,
            v_canonical_ledger_id,
            (SELECT name FROM public.ledgers WHERE id = v_canonical_ledger_id),
            v_duplicate_ledger_id,
            (SELECT name FROM public.ledgers WHERE id = v_duplicate_ledger_id),
            0::INTEGER,
            0::INTEGER,
            0::INTEGER,
            'ERROR: ' || SQLERRM::TEXT;
        END;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.bulk_merge_duplicate_ledgers(UUID, UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- supabase/migrations/20260604190000_fix_sales_orders_fk_constraint.sql
-- ============================================================
-- ============================================================================
-- Fix: Sales Orders FK Constraint — Allow customer_id to reference ledgers
-- ============================================================================

-- Drop the old FK constraint that references customers table
-- (we now use ledgers as the unified customer/supplier master)
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_customer_id_fkey;

-- Make customer_id nullable (sales can reference ledgers via ledger_id or just use customer_name)
ALTER TABLE public.sales_orders ALTER COLUMN customer_id DROP NOT NULL;

-- Add comment explaining the new relationship
COMMENT ON COLUMN public.sales_orders.customer_id IS 
  'Legacy reference to customers table. New code should use ledger_id for unified ledger linking.';

-- Ensure ledger_id column exists and can reference ledgers
-- (this was added in 20260602160000_add_journal_vouchers.sql but let's ensure it's properly set up)
DO $$
BEGIN
  -- Column already exists from previous migration, just ensure it's indexed
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_sales_orders_ledger_id'
  ) THEN
    CREATE INDEX idx_sales_orders_ledger_id ON public.sales_orders(ledger_id);
  END IF;
END $$;

-- ============================================================================
-- Same fix for purchase_orders
-- ============================================================================

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey;

COMMENT ON COLUMN public.purchase_orders.supplier_id IS 
  'Legacy reference to suppliers table. New code should use ledger_id for unified ledger linking.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_purchase_orders_ledger_id'
  ) THEN
    CREATE INDEX idx_purchase_orders_ledger_id ON public.purchase_orders(ledger_id);
  END IF;
END $$;

-- ============================================================
-- supabase/migrations/20260604200000_fix_sales_voucher_credit_logic.sql
-- ============================================================
-- ============================================================================
-- Fix: Sales Voucher Trigger — Correctly handle credit vs cash sales
-- ============================================================================

CREATE OR REPLACE FUNCTION public.post_sale_voucher()
RETURNS TRIGGER AS $$
DECLARE
  v_sales_account UUID;
  v_cash_ledger UUID;
  v_customer_ledger UUID;
  v_voucher_id UUID;
  v_fy TEXT;
  v_is_cash BOOLEAN;
BEGIN
  v_fy := public.get_financial_year(COALESCE(NEW.sale_date, CURRENT_DATE));

  -- Determine if this is a cash sale:
  -- Cash sale = payment is complete (paid AND amount_paid >= total)
  --            OR method is cash/upi/card AND status is paid (not credit!)
  -- Credit sale = payment_status = 'credit' OR partial payment
  v_is_cash := (NEW.payment_status = 'paid' AND COALESCE(NEW.amount_paid,0) >= NEW.total_amount)
    OR (NEW.payment_method IN ('cash','upi','card') 
        AND NEW.payment_status = 'paid');
  
  -- Explicitly NOT cash if:
  -- - payment_status = 'credit' (buy now, pay later)
  -- - payment_status = 'partial' (partial payment made)
  IF NEW.payment_status IN ('credit', 'partial') THEN
    v_is_cash := false;
  END IF;

  -- Resolve ledgers
  v_sales_account := public.get_or_create_system_ledger(NEW.company_id, 'Sales Account', 'Income', 'income');

  -- For credit sales, we need the customer ledger
  IF NOT v_is_cash THEN
    v_customer_ledger := public.resolve_party_ledger(NEW.company_id, NEW.customer_name, 'customer');
  ELSE
    -- For cash sales, still try to link to customer ledger for tracking
    v_customer_ledger := public.resolve_party_ledger(NEW.company_id, NEW.customer_name, 'customer');
    v_cash_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Cash', 'Cash-in-Hand', 'cash');
  END IF;

  -- Insert voucher
  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    NEW.company_id, COALESCE(NEW.sale_date, CURRENT_DATE), 'sales_order', NEW.id,
    COALESCE(NEW.invoice_number, 'Sale-' || NEW.id::TEXT),
    CASE 
      WHEN v_is_cash THEN 'Cash sale' 
      ELSE 'Credit sale - ' || COALESCE(NEW.customer_name, 'Unknown')
    END,
    NEW.total_amount, NEW.created_by
  )
  RETURNING id INTO v_voucher_id;

  -- Debit side
  IF v_is_cash THEN
    -- Cash sale: Debit Cash
    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, NEW.total_amount, 0, 'Cash / UPI / Card received');
    
    -- For cash sales, we DON'T debit the customer ledger (they already paid)
    -- But we DO link the sale to the customer for reporting via sales_orders.ledger_id
  ELSE
    -- Credit sale: Debit Customer (receivable)
    IF v_customer_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_customer_ledger, NEW.company_id, NEW.total_amount, 0, 
              'Receivable from ' || COALESCE(NEW.customer_name, 'customer'));
    END IF;
  END IF;

  -- Credit side (Sales Account) - always present
  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, v_sales_account, NEW.company_id, 0, NEW.total_amount, 'Sales income');

  -- Store resolved ledger on the order for future reference
  IF v_customer_ledger IS NOT NULL THEN
    UPDATE public.sales_orders SET ledger_id = v_customer_ledger WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_post_sale_voucher ON public.sales_orders;
CREATE TRIGGER trg_post_sale_voucher
  AFTER INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.post_sale_voucher();

-- ============================================================================
-- Fix: Regenerate journal entries for recent sales that may have wrong entries
-- This fixes existing data after the trigger logic change
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
  v_voucher_id UUID;
  v_sales_account UUID;
  v_customer_ledger UUID;
  v_should_be_cash BOOLEAN;
BEGIN
  -- Find sales where payment_status=credit but journal shows cash sale (wrong narration)
  FOR rec IN
    SELECT so.id, so.company_id, so.invoice_number, so.customer_name, so.total_amount,
           so.sale_date, so.created_by, so.ledger_id, so.payment_status,
           jv.id as voucher_id, jv.narration
    FROM public.sales_orders so
    JOIN public.journal_vouchers jv ON jv.reference_id = so.id AND jv.reference_type = 'sales_order'
    WHERE so.payment_status = 'credit'
      AND jv.narration = 'Cash sale'
    ORDER BY so.created_at DESC
    LIMIT 100
  LOOP
    -- This sale should be credit but was recorded as cash - fix it
    
    -- Delete wrong voucher lines
    DELETE FROM public.journal_voucher_lines WHERE voucher_id = rec.voucher_id;
    
    -- Get ledgers
    v_sales_account := public.get_or_create_system_ledger(rec.company_id, 'Sales Account', 'Income', 'income');
    v_customer_ledger := rec.ledger_id;
    
    IF v_customer_ledger IS NULL THEN
      v_customer_ledger := public.resolve_party_ledger(rec.company_id, rec.customer_name, 'customer');
    END IF;
    
    -- Update voucher narration
    UPDATE public.journal_vouchers 
    SET narration = 'Credit sale - ' || COALESCE(rec.customer_name, 'Unknown')
    WHERE id = rec.voucher_id;
    
    -- Create correct lines: Debit Customer, Credit Sales Account
    IF v_customer_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (rec.voucher_id, v_customer_ledger, rec.company_id, rec.total_amount, 0, 
              'Receivable from ' || COALESCE(rec.customer_name, 'customer'));
    END IF;
    
    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (rec.voucher_id, v_sales_account, rec.company_id, 0, rec.total_amount, 'Sales income');
    
    -- Ensure ledger_id is set
    IF v_customer_ledger IS NOT NULL THEN
      UPDATE public.sales_orders SET ledger_id = v_customer_ledger WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- Also fix any cash sales that have wrong tracking entries (credit to customer instead of nothing)
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Find cash sales where customer ledger was credited (wrong tracking entry)
  FOR rec IN
    SELECT DISTINCT jvl.id as line_id, jvl.voucher_id
    FROM public.journal_voucher_lines jvl
    JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id
    WHERE jv.reference_type = 'sales_order'
      AND jv.narration = 'Cash sale'
      AND jvl.credit_amount > 0
      AND jvl.narration LIKE '%tracking%'
  LOOP
    -- Remove these wrong tracking entries
    DELETE FROM public.journal_voucher_lines WHERE id = rec.line_id;
  END LOOP;
END $$;

-- ============================================================
-- supabase/migrations/20260604203000_fix_null_balance_trigger.sql
-- ============================================================
-- ============================================================================
-- Hotfix: Fix NULL current_balance in recalculate_ledger_balance trigger
-- Issue: v_opening is NULL when no previous balance exists (no rows returned)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_ledger_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_ledger_id UUID;
  v_company_id UUID;
  v_fy TEXT;
  v_total_debit NUMERIC(18,4) := 0;
  v_total_credit NUMERIC(18,4) := 0;
  v_opening NUMERIC(18,4) := 0;
  v_current NUMERIC(18,4);
  v_balance_found BOOLEAN := false;
BEGIN
  -- Determine affected ledger
  IF TG_OP = 'DELETE' THEN
    v_ledger_id := OLD.ledger_id;
    v_company_id := OLD.company_id;
  ELSE
    v_ledger_id := NEW.ledger_id;
    v_company_id := NEW.company_id;
  END IF;

  -- Use current date for FY; all balances run in the current FY for real-time updates.
  v_fy := public.get_financial_year(CURRENT_DATE);

  -- Get totals from journal lines
  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_total_debit, v_total_credit
  FROM public.journal_voucher_lines
  WHERE ledger_id = v_ledger_id;

  -- Get opening balance for this FY (if exists)
  SELECT opening_balance INTO v_opening
  FROM public.ledger_balances
  WHERE ledger_id = v_ledger_id AND financial_year = v_fy;
  
  -- If no row found, set opening to 0
  IF NOT FOUND THEN
    v_opening := 0;
  END IF;

  -- Calculate current balance
  v_current := COALESCE(v_opening, 0) + v_total_debit - v_total_credit;

  INSERT INTO public.ledger_balances (
    ledger_id, company_id, financial_year, opening_balance, opening_balance_type,
    current_balance, total_debit, total_credit, closing_balance, closing_balance_type
  ) VALUES (
    v_ledger_id, v_company_id, v_fy,
    COALESCE(v_opening, 0), 'debit'::public.balance_type,
    v_current, v_total_debit, v_total_credit,
    v_current,
    CASE WHEN v_current >= 0 THEN 'debit'::public.balance_type ELSE 'credit'::public.balance_type END
  )
  ON CONFLICT (ledger_id, financial_year) DO UPDATE SET
    current_balance = EXCLUDED.current_balance,
    total_debit = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    closing_balance = EXCLUDED.closing_balance,
    closing_balance_type = EXCLUDED.closing_balance_type,
    updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- supabase/migrations/20260604204000_fix_inventory_batches_fk.sql
-- ============================================================
-- ============================================================================
-- Fix: Inventory Batches FK — Migrate supplier_id to ledger_id
-- ============================================================================

-- 1. Drop the old FK constraint that references suppliers table
ALTER TABLE public.inventory_batches 
DROP CONSTRAINT IF EXISTS inventory_batches_supplier_id_fkey;

-- 2. Add ledger_id column that references the unified ledgers table
ALTER TABLE public.inventory_batches 
ADD COLUMN IF NOT EXISTS ledger_id UUID REFERENCES public.ledgers(id) ON DELETE SET NULL;

-- 3. Create index for ledger_id
CREATE INDEX IF NOT EXISTS idx_inventory_batches_ledger_id 
ON public.inventory_batches(ledger_id);

-- 4. Migrate existing data: try to match supplier_id to ledger_id
-- This is a best-effort migration for existing data
UPDATE public.inventory_batches ib
SET ledger_id = l.id
FROM public.ledgers l
WHERE ib.supplier_id IS NOT NULL 
  AND ib.ledger_id IS NULL
  AND l.id = ib.supplier_id;  -- Only works if supplier was already migrated to ledger

-- 5. Note: supplier_id is kept for backward compatibility but no longer has FK constraint
-- The application should migrate to using ledger_id for new batches

-- 6. Add comment explaining the change
COMMENT ON COLUMN public.inventory_batches.supplier_id IS 
  'Legacy supplier reference. New code should use ledger_id which references the unified ledgers table.';

COMMENT ON COLUMN public.inventory_batches.ledger_id IS 
  'Reference to unified ledger (supplier). Use this for new code.';

-- ============================================================
-- supabase/migrations/20260604207000_fix_purchase_voucher_ledger_lookup.sql
-- ============================================================
-- ============================================================================
-- Fix: post_purchase_voucher trigger — supplier_id is now ledger_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.post_purchase_voucher()
RETURNS TRIGGER AS $$
DECLARE
  v_purchase_account UUID;
  v_supplier_ledger UUID;
  v_cash_ledger UUID;
  v_bank_ledger UUID;
  v_voucher_id UUID;
  v_supplier_name TEXT;
  v_is_cash BOOLEAN;
  v_method TEXT;
BEGIN
  -- supplier_id is now the ledger_id (unified ledger system)
  -- Look up the supplier name from ledgers table
  SELECT name INTO v_supplier_name
  FROM public.ledgers
  WHERE id = NEW.supplier_id AND company_id = NEW.company_id;

  IF v_supplier_name IS NULL THEN
    v_supplier_name := 'Supplier ' || NEW.supplier_id::TEXT;
  END IF;

  -- supplier_id IS the ledger_id now
  v_supplier_ledger := NEW.supplier_id;

  -- Determine if this is a cash purchase
  v_method := COALESCE(NEW.payment_method, 'credit');
  v_is_cash := (NEW.payment_status = 'paid' AND COALESCE(NEW.amount_paid, 0) >= NEW.total_amount)
    OR (v_method IN ('cash', 'upi', 'card') AND NEW.payment_status = 'paid');

  v_purchase_account := public.get_or_create_system_ledger(NEW.company_id, 'Purchase Account', 'Expenses', 'expense');

  -- Resolve cash/bank ledger for cash purchases
  IF v_is_cash THEN
    IF v_method IN ('bank_transfer', 'cheque') THEN
      v_bank_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Bank Account', 'Bank Accounts', 'bank');
    ELSE
      v_cash_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Cash', 'Cash-in-Hand', 'cash');
    END IF;
  END IF;

  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    NEW.company_id, COALESCE(NEW.order_date, CURRENT_DATE), 'purchase_order', NEW.id,
    COALESCE(NEW.invoice_number, NEW.order_number, 'PO-' || NEW.id::TEXT),
    CASE WHEN v_is_cash 
      THEN 'Cash purchase from ' || v_supplier_name 
      ELSE 'Purchase from ' || v_supplier_name 
    END,
    NEW.total_amount, NEW.created_by
  )
  RETURNING id INTO v_voucher_id;

  -- Debit: Purchase Account (always)
  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, v_purchase_account, NEW.company_id, NEW.total_amount, 0, 
          CASE WHEN v_is_cash THEN 'Cash purchase expense' ELSE 'Purchase expense' END);

  -- Credit side
  IF v_is_cash THEN
    -- Cash purchase: Credit Cash or Bank
    IF v_bank_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_bank_ledger, NEW.company_id, 0, NEW.total_amount, 'Paid via bank/' || v_method);
    ELSE
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, 0, NEW.total_amount, 'Paid via ' || v_method);
    END IF;
    
    -- For cash purchases, we don't credit supplier (they were paid immediately)
    -- But we still link the order to supplier ledger for tracking/reporting
    IF v_supplier_ledger IS NOT NULL THEN
      UPDATE public.purchase_orders SET ledger_id = v_supplier_ledger WHERE id = NEW.id;
    END IF;
  ELSE
    -- Credit purchase: Credit Supplier (payable)
    IF v_supplier_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_supplier_ledger, NEW.company_id, 0, NEW.total_amount, 'Payable to ' || v_supplier_name);
      UPDATE public.purchase_orders SET ledger_id = v_supplier_ledger WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_post_purchase_voucher ON public.purchase_orders;
CREATE TRIGGER trg_post_purchase_voucher
  AFTER INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.post_purchase_voucher();

-- ============================================================
-- supabase/migrations/20260604208000_fix_journal_voucher_narrations.sql
-- ============================================================
-- ============================================================================
-- Fix: Update existing journal vouchers with wrong "Supplier UUID..." narration
-- ============================================================================

-- Update journal_vouchers narration to use proper supplier names from ledgers
UPDATE public.journal_vouchers jv
SET narration = CASE 
  WHEN jv.narration LIKE 'Purchase from Supplier %' THEN
    'Purchase from ' || COALESCE(l.name, 'Unknown')
  WHEN jv.narration LIKE 'Cash purchase from Supplier %' THEN
    'Cash purchase from ' || COALESCE(l.name, 'Unknown')
  ELSE jv.narration
END
FROM public.ledgers l
WHERE jv.narration LIKE '%Supplier %'
  AND l.id = substring(jv.narration from '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::UUID;

-- Update journal_voucher_lines narration for payable entries
UPDATE public.journal_voucher_lines jvl
SET narration = 'Payable to ' || COALESCE(l.name, 'Unknown')
FROM public.ledgers l
WHERE jvl.narration LIKE 'Payable to Supplier %'
  AND l.id = substring(jvl.narration from '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::UUID;

-- Also fix any lines that have generic expense references
UPDATE public.journal_voucher_lines
SET narration = CASE
  WHEN narration LIKE 'Cash purchase expense%' THEN 'Cash purchase expense'
  WHEN narration LIKE 'Purchase expense%' THEN 'Purchase expense'
  ELSE narration
END
WHERE narration LIKE '%purchase expense%Supplier%' OR narration LIKE '%Supplier%expense%';

-- ============================================================
-- supabase/migrations/20260604209000_merge_fake_supplier_ledger.sql
-- ============================================================
-- ============================================================================
-- Fix: Merge fake "Supplier UUID..." ledger into real medikab lifescience pvt. ltd. ledger
-- ============================================================================

-- Disable triggers temporarily to prevent FK violations
ALTER TABLE public.journal_voucher_lines DISABLE TRIGGER trg_recalculate_balance;
ALTER TABLE public.ledgers DISABLE TRIGGER trg_ledger_audit;
ALTER TABLE public.ledgers DISABLE TRIGGER trg_ledgers_updated;

-- 1. Delete audit log entries for fake ledger
DELETE FROM public.ledger_audit_log
WHERE ledger_id = '92def401-5654-4698-a6e2-705cafa0aa2f';

-- 2. Update journal_voucher_lines to use real ledger ID instead of fake one
UPDATE public.journal_voucher_lines
SET ledger_id = '77904247-334b-4007-9577-97f917cfccec'
WHERE ledger_id = '92def401-5654-4698-a6e2-705cafa0aa2f';

-- 3. Update purchase_orders.ledger_id to use real ledger
UPDATE public.purchase_orders
SET ledger_id = '77904247-334b-4007-9577-97f917cfccec'
WHERE ledger_id = '92def401-5654-4698-a6e2-705cafa0aa2f';

-- 4. Delete the fake ledger
DELETE FROM public.ledgers
WHERE id = '92def401-5654-4698-a6e2-705cafa0aa2f';

-- Re-enable triggers
ALTER TABLE public.journal_voucher_lines ENABLE TRIGGER trg_recalculate_balance;
ALTER TABLE public.ledgers ENABLE TRIGGER trg_ledger_audit;
ALTER TABLE public.ledgers ENABLE TRIGGER trg_ledgers_updated;

-- 5. Add 'supplier' role to real medikab ledger if missing
INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary, priority)
SELECT '77904247-334b-4007-9577-97f917cfccec', company_id, 'supplier', false, 1
FROM public.ledgers
WHERE id = '77904247-334b-4007-9577-97f917cfccec'
  AND NOT EXISTS (
    SELECT 1 FROM public.ledger_roles 
    WHERE ledger_id = '77904247-334b-4007-9577-97f917cfccec' 
    AND role_type = 'supplier'
  );

-- 6. Force balance recalculation for real medikab ledger
-- This will correct any cached balance values
DELETE FROM public.ledger_balances 
WHERE ledger_id = '77904247-334b-4007-9577-97f917cfccec';

-- Re-insert correct balance by summing all journal lines
INSERT INTO public.ledger_balances (
  ledger_id, company_id, financial_year, opening_balance, opening_balance_type,
  current_balance, total_debit, total_credit, closing_balance, closing_balance_type
)
SELECT 
  '77904247-334b-4007-9577-97f917cfccec' as ledger_id,
  '1e98ddf2-6152-401b-8c12-da78cc41dd3f' as company_id,
  public.get_financial_year(CURRENT_DATE) as financial_year,
  0 as opening_balance,
  'debit'::public.balance_type as opening_balance_type,
  COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) as current_balance,
  COALESCE(SUM(debit_amount), 0) as total_debit,
  COALESCE(SUM(credit_amount), 0) as total_credit,
  COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) as closing_balance,
  CASE WHEN COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) >= 0 
    THEN 'debit'::public.balance_type 
    ELSE 'credit'::public.balance_type 
  END as closing_balance_type
FROM public.journal_voucher_lines
WHERE ledger_id = '77904247-334b-4007-9577-97f917cfccec';

-- ============================================================
-- supabase/migrations/20260604210000_add_cash_purchase_support.sql
-- ============================================================
-- ============================================================================
-- Cash Purchase Support — Add payment fields to purchase_orders and update trigger
-- ============================================================================

-- 1. Add payment_method and payment_status to purchase_orders (like sales_orders)
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'credit' 
  CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer', 'cheque', 'credit'));

ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' 
  CHECK (payment_status IN ('paid', 'pending', 'partial'));

ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(18,4) DEFAULT 0;

-- 2. Update post_purchase_voucher to handle cash purchases
CREATE OR REPLACE FUNCTION public.post_purchase_voucher()
RETURNS TRIGGER AS $$
DECLARE
  v_purchase_account UUID;
  v_supplier_ledger UUID;
  v_cash_ledger UUID;
  v_bank_ledger UUID;
  v_voucher_id UUID;
  v_supplier_name TEXT;
  v_is_cash BOOLEAN;
  v_method TEXT;
BEGIN
  -- Resolve supplier name
  SELECT name INTO v_supplier_name
  FROM public.suppliers
  WHERE id = NEW.supplier_id AND company_id = NEW.company_id;

  IF v_supplier_name IS NULL THEN
    v_supplier_name := 'Supplier ' || NEW.supplier_id::TEXT;
  END IF;

  -- Determine if this is a cash purchase
  v_method := COALESCE(NEW.payment_method, 'credit');
  v_is_cash := (NEW.payment_status = 'paid' AND COALESCE(NEW.amount_paid, 0) >= NEW.total_amount)
    OR (v_method IN ('cash', 'upi', 'card') AND NEW.payment_status = 'paid');

  v_purchase_account := public.get_or_create_system_ledger(NEW.company_id, 'Purchase Account', 'Expenses', 'expense');
  
  -- Resolve supplier ledger (for tracking even in cash purchases)
  v_supplier_ledger := public.resolve_party_ledger(NEW.company_id, v_supplier_name, 'supplier');

  -- Resolve cash/bank ledger for cash purchases
  IF v_is_cash THEN
    IF v_method IN ('bank_transfer', 'cheque') THEN
      v_bank_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Bank Account', 'Bank Accounts', 'bank');
    ELSE
      v_cash_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Cash', 'Cash-in-Hand', 'cash');
    END IF;
  END IF;

  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    NEW.company_id, COALESCE(NEW.order_date, CURRENT_DATE), 'purchase_order', NEW.id,
    COALESCE(NEW.invoice_number, NEW.order_number, 'PO-' || NEW.id::TEXT),
    CASE WHEN v_is_cash 
      THEN 'Cash purchase from ' || v_supplier_name 
      ELSE 'Purchase from ' || v_supplier_name 
    END,
    NEW.total_amount, NEW.created_by
  )
  RETURNING id INTO v_voucher_id;

  -- Debit: Purchase Account (always)
  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, v_purchase_account, NEW.company_id, NEW.total_amount, 0, 
          CASE WHEN v_is_cash THEN 'Cash purchase expense' ELSE 'Purchase expense' END);

  -- Credit side
  IF v_is_cash THEN
    -- Cash purchase: Credit Cash or Bank
    IF v_bank_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_bank_ledger, NEW.company_id, 0, NEW.total_amount, 'Paid via bank/' || v_method);
    ELSE
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, 0, NEW.total_amount, 'Paid via ' || v_method);
    END IF;
    
    -- For cash purchases, we don't credit supplier (they were paid immediately)
    -- But we still link the order to supplier ledger for tracking/reporting
    IF v_supplier_ledger IS NOT NULL THEN
      UPDATE public.purchase_orders SET ledger_id = v_supplier_ledger WHERE id = NEW.id;
    END IF;
  ELSE
    -- Credit purchase: Credit Supplier (payable)
    IF v_supplier_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_supplier_ledger, NEW.company_id, 0, NEW.total_amount, 'Payable to ' || v_supplier_name);
      UPDATE public.purchase_orders SET ledger_id = v_supplier_ledger WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS trg_post_purchase_voucher ON public.purchase_orders;
CREATE TRIGGER trg_post_purchase_voucher
  AFTER INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.post_purchase_voucher();

-- 3. Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_purchase_orders_payment_method ON public.purchase_orders(company_id, payment_method);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_payment_status ON public.purchase_orders(company_id, payment_status);

-- ============================================================
-- supabase/migrations/20260604211000_add_expense_entry_function.sql
-- ============================================================
-- ============================================================================
-- Expense Entry Support — Manual expense voucher creation
-- ============================================================================

-- Function to create an expense voucher
CREATE OR REPLACE FUNCTION public.create_expense_voucher(
  p_company_id UUID,
  p_date DATE,
  p_expense_ledger_id UUID,
  p_payment_ledger_id UUID,  -- Cash or Bank ledger
  p_amount NUMERIC,
  p_description TEXT,
  p_reference_number TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_voucher_id UUID;
  v_expense_name TEXT;
  v_payment_name TEXT;
BEGIN
  -- Get ledger names for narration
  SELECT name INTO v_expense_name FROM public.ledgers WHERE id = p_expense_ledger_id;
  SELECT name INTO v_payment_name FROM public.ledgers WHERE id = p_payment_ledger_id;

  -- Create voucher header
  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    p_company_id, COALESCE(p_date, CURRENT_DATE), 'expense', NULL,
    COALESCE(p_reference_number, 'EXP-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6)),
    COALESCE(p_description, 'Expense: ' || v_expense_name || ' paid via ' || v_payment_name),
    p_amount, p_created_by
  )
  RETURNING id INTO v_voucher_id;

  -- Debit: Expense Account
  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, p_expense_ledger_id, p_company_id, p_amount, 0, 
          COALESCE(p_description, v_expense_name || ' expense'));

  -- Credit: Cash/Bank Account
  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, p_payment_ledger_id, p_company_id, 0, p_amount, 
          'Payment for ' || v_expense_name);

  RETURN v_voucher_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.create_expense_voucher(UUID, DATE, UUID, UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

-- Function to get expense ledgers (all ledgers under Expenses group)
CREATE OR REPLACE FUNCTION public.get_expense_ledgers(p_company_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  group_name TEXT,
  current_balance NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.name,
    COALESCE(lg.name, 'Expenses')::TEXT as group_name,
    COALESCE(lb.current_balance, 0) as current_balance
  FROM public.ledgers l
  LEFT JOIN public.ledger_groups lg ON lg.id = l.ledger_group_id
  LEFT JOIN public.ledger_balances lb ON lb.ledger_id = l.id 
    AND lb.financial_year = public.get_financial_year(CURRENT_DATE)
  WHERE l.company_id = p_company_id
    AND l.is_active = true
    AND (
      lg.group_type = 'expenses' 
      OR EXISTS (
        SELECT 1 FROM public.ledger_roles lr 
        WHERE lr.ledger_id = l.id AND lr.role_type = 'expense'
      )
    )
  ORDER BY l.name;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_expense_ledgers(UUID) TO authenticated;

