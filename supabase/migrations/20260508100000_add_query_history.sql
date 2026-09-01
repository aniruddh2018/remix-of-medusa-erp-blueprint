-- Migration: Add query history and related tables for ERP Query Engine
-- Phase 1.1 of the ERP Query Engine implementation

-- Query History Table (Audit trail for all queries)
CREATE TABLE IF NOT EXISTS query_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  company_id UUID REFERENCES companies(id) NOT NULL,
  query_text TEXT NOT NULL,
  query_type VARCHAR(50) NOT NULL DEFAULT 'natural_language',
  generated_sql TEXT,
  execution_time_ms INTEGER,
  row_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET
);

-- Query Templates Table (Saved queries)
CREATE TABLE IF NOT EXISTS query_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  query_text TEXT NOT NULL,
  query_type VARCHAR(50) NOT NULL DEFAULT 'natural_language',
  parameters JSONB DEFAULT '{}', -- Template parameters { "start_date": "date", "customer_id": "uuid" }
  default_format VARCHAR(50) DEFAULT 'table',
  is_public BOOLEAN DEFAULT false,
  company_id UUID REFERENCES companies(id) NOT NULL,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Custom Calculations Table (User-defined formulas)
CREATE TABLE IF NOT EXISTS custom_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  formula TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]', -- [{ "name": "revenue", "source": "column", "table": "sales_orders" }]
  aggregation VARCHAR(50), -- sum, avg, count, none
  result_format VARCHAR(50) DEFAULT 'number', -- currency, percent, number, decimal
  is_public BOOLEAN DEFAULT false,
  company_id UUID REFERENCES companies(id) NOT NULL,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Data Favorites Table (Bookmarked queries/results)
CREATE TABLE IF NOT EXISTS data_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name VARCHAR(255) NOT NULL,
  query_template_id UUID REFERENCES query_templates(id),
  saved_query_text TEXT, -- Raw query text if not a template
  filters JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE query_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_favorites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for query_history
CREATE POLICY query_history_user_isolation ON query_history
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY query_history_company_isolation ON query_history
  FOR ALL USING (company_id = (SELECT company_id FROM profiles WHERE user_id = auth.uid()));

-- RLS Policies for query_templates
CREATE POLICY query_templates_company_isolation ON query_templates
  FOR ALL USING (company_id = (SELECT company_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY query_templates_public_read ON query_templates
  FOR SELECT USING (is_public = true OR created_by = auth.uid());

-- RLS Policies for custom_calculations
CREATE POLICY custom_calculations_company_isolation ON custom_calculations
  FOR ALL USING (company_id = (SELECT company_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY custom_calculations_public_read ON custom_calculations
  FOR SELECT USING (is_public = true OR created_by = auth.uid());

-- RLS Policies for data_favorites
CREATE POLICY data_favorites_user_isolation ON data_favorites
  FOR ALL USING (user_id = auth.uid());

-- RLS Policies for user_companies (if not already exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_companies')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_companies' AND policyname = 'user_companies_user_access') THEN
    ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;
    CREATE POLICY user_companies_user_access ON user_companies
      FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_query_history_user ON query_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_history_company ON query_history(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_history_type ON query_history(query_type);

CREATE INDEX IF NOT EXISTS idx_query_templates_company ON query_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_query_templates_creator ON query_templates(created_by);

CREATE INDEX IF NOT EXISTS idx_custom_calculations_company ON custom_calculations(company_id);
CREATE INDEX IF NOT EXISTS idx_custom_calculations_creator ON custom_calculations(created_by);

CREATE INDEX IF NOT EXISTS idx_data_favorites_user ON data_favorites(user_id);

-- Helper function to get user's company_id
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT company_id FROM profiles WHERE user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin(_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = _user_id AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to execute read-only queries (for the edge function)
-- Note: This is a placeholder. In production, implement proper query sandboxing
CREATE OR REPLACE FUNCTION execute_readonly_query(query_sql TEXT, max_rows INTEGER DEFAULT 1000)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  -- Basic safety check: ensure query starts with SELECT
  IF NOT (query_sql ~* '^\\s*SELECT') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  
  -- Execute with row limit
  EXECUTE format('SELECT jsonb_agg(q.*) FROM (%s LIMIT %s) q', query_sql, max_rows)
  INTO result;
  
  RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_query_templates_updated_at BEFORE UPDATE ON query_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_calculations_updated_at BEFORE UPDATE ON custom_calculations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT ALL ON query_history TO authenticated;
GRANT ALL ON query_templates TO authenticated;
GRANT ALL ON custom_calculations TO authenticated;
GRANT ALL ON data_favorites TO authenticated;

GRANT EXECUTE ON FUNCTION get_user_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION execute_readonly_query(TEXT, INTEGER) TO authenticated;
