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
