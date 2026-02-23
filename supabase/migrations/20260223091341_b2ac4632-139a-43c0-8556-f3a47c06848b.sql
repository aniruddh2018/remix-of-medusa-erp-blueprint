
-- Step 1: Add super_admin to enum (must be in its own transaction)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
