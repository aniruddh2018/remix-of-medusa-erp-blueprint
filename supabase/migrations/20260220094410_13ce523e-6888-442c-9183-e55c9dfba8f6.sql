-- Add business_module preference to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_module text NOT NULL DEFAULT 'pharmacy';

-- Add a check constraint for valid module values
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_business_module_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_business_module_check 
  CHECK (business_module IN ('pharmacy', 'cosmetics', 'electronics', 'clothing', 'general', 'manufacturing'));
