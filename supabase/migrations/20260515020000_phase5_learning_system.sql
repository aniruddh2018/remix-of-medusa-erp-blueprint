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
