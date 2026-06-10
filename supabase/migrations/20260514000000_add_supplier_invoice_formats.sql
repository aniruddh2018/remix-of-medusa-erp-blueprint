-- Supplier Invoice Format Learning System
-- Stores learned invoice format patterns per supplier for improved extraction accuracy

CREATE TABLE supplier_invoice_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Format classification
  format_type VARCHAR(50) NOT NULL CHECK (format_type IN ('standard_table', 'compact_grid', 'multi_section', 'gst_compliant', 'pharma_specific', 'unstructured')),
  format_confidence INTEGER NOT NULL CHECK (format_confidence >= 0 AND format_confidence <= 100),
  
  -- Layout analysis
  page_layout VARCHAR(255),
  field_positions JSONB,
  table_structure JSONB,
  special_features JSONB DEFAULT '[]'::jsonb,
  
  -- Column mapping learned from corrections
  column_mappings JSONB DEFAULT '{}'::jsonb,
  -- e.g., {"product_name": ["Item Description", "Product"], "batch_number": ["Batch", "Batch No"]}
  
  -- Extraction statistics
  total_scanned INTEGER NOT NULL DEFAULT 1,
  successful_extractions INTEGER NOT NULL DEFAULT 1,
  avg_confidence INTEGER,
  
  -- Format fingerprint for quick matching
  format_fingerprint VARCHAR(255),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Unique constraint: one format per supplier per type
  UNIQUE(supplier_id, format_type, format_fingerprint)
);

-- Indexes for performance
CREATE INDEX idx_supplier_invoice_formats_supplier ON supplier_invoice_formats(supplier_id);
CREATE INDEX idx_supplier_invoice_formats_company ON supplier_invoice_formats(company_id);
CREATE INDEX idx_supplier_invoice_formats_type ON supplier_invoice_formats(format_type);
CREATE INDEX idx_supplier_invoice_formats_fingerprint ON supplier_invoice_formats(format_fingerprint);

-- Row Level Security
ALTER TABLE supplier_invoice_formats ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_invoice_formats_company_isolation ON supplier_invoice_formats
  FOR ALL USING (company_id = get_user_company_id());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_supplier_invoice_format_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_supplier_invoice_format_timestamp
  BEFORE UPDATE ON supplier_invoice_formats
  FOR EACH ROW EXECUTE FUNCTION update_supplier_invoice_format_timestamp();

-- Function to increment scan statistics
CREATE OR REPLACE FUNCTION increment_invoice_format_stats(
  _format_id UUID,
  _success BOOLEAN,
  _confidence INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE supplier_invoice_formats
  SET 
    total_scanned = total_scanned + 1,
    successful_extractions = successful_extractions + CASE WHEN _success THEN 1 ELSE 0 END,
    avg_confidence = ((avg_confidence * (total_scanned - 1)) + _confidence) / total_scanned,
    last_used_at = NOW()
  WHERE id = _format_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to upsert learned format from extraction
CREATE OR REPLACE FUNCTION upsert_learned_invoice_format(
  _supplier_id UUID,
  _company_id UUID,
  _format_type VARCHAR(50),
  _format_confidence INTEGER,
  _page_layout VARCHAR(255),
  _field_positions JSONB,
  _table_structure JSONB,
  _special_features JSONB,
  _column_mappings JSONB,
  _format_fingerprint VARCHAR(255),
  _user_id UUID
)
RETURNS UUID AS $$
DECLARE
  _format_id UUID;
BEGIN
  -- Try to update existing format
  UPDATE supplier_invoice_formats
  SET 
    format_confidence = GREATEST(format_confidence, _format_confidence),
    page_layout = COALESCE(_page_layout, page_layout),
    field_positions = COALESCE(_field_positions, field_positions),
    table_structure = COALESCE(_table_structure, table_structure),
    special_features = COALESCE(_special_features, special_features),
    column_mappings = column_mappings || _column_mappings,
    total_scanned = total_scanned + 1,
    successful_extractions = successful_extractions + 1,
    last_used_at = NOW(),
    updated_at = NOW()
  WHERE supplier_id = _supplier_id 
    AND format_type = _format_type 
    AND (format_fingerprint = _format_fingerprint OR format_fingerprint IS NULL)
  RETURNING id INTO _format_id;
  
  -- If no existing format, create new
  IF _format_id IS NULL THEN
    INSERT INTO supplier_invoice_formats (
      supplier_id, company_id, format_type, format_confidence,
      page_layout, field_positions, table_structure, special_features,
      column_mappings, format_fingerprint, created_by
    ) VALUES (
      _supplier_id, _company_id, _format_type, _format_confidence,
      _page_layout, _field_positions, _table_structure, _special_features,
      _column_mappings, _format_fingerprint, _user_id
    )
    RETURNING id INTO _format_id;
  END IF;
  
  RETURN _format_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
