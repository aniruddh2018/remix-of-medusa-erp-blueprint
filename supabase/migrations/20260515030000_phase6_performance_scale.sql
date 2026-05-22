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
