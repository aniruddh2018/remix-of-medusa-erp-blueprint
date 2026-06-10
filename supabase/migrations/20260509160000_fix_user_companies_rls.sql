-- Create user_companies table if not exists
CREATE TABLE IF NOT EXISTS user_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  company_id UUID REFERENCES companies(id) NOT NULL,
  role app_role DEFAULT 'staff',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, company_id)
);

-- Enable RLS on user_companies
ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;

-- Add policy for user access
CREATE POLICY user_companies_user_access ON user_companies
  FOR ALL USING (user_id = auth.uid());

-- Grant permissions
GRANT ALL ON user_companies TO authenticated;