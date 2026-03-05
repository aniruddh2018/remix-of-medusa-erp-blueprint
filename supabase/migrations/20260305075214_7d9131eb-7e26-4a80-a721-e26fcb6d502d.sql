
-- 1. Create atomic onboarding function (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.complete_onboarding(_company_name text, _business_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _existing_company_id uuid;
  _new_company_id uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotent: if user already has a company, return it
  SELECT company_id INTO _existing_company_id
  FROM public.profiles
  WHERE user_id = _user_id;

  IF _existing_company_id IS NOT NULL THEN
    RETURN _existing_company_id;
  END IF;

  -- Create company
  INSERT INTO public.companies (name, business_type)
  VALUES (_company_name, _business_type)
  RETURNING id INTO _new_company_id;

  -- Link profile
  UPDATE public.profiles
  SET company_id = _new_company_id, business_module = _business_type
  WHERE user_id = _user_id;

  -- Promote to admin (upsert)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Remove staff role if exists (user is now admin)
  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND role = 'staff';

  RETURN _new_company_id;
END;
$$;

-- 2. Fix RLS: Add PERMISSIVE policies so users can actually read their data
-- Without at least one PERMISSIVE policy, all RESTRICTIVE policies result in denial

-- user_roles: users must be able to read own roles
CREATE POLICY "permissive_users_view_own_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- profiles: users must be able to read own profile
CREATE POLICY "permissive_users_view_own_profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- profiles: users must be able to update own profile
CREATE POLICY "permissive_users_update_own_profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- companies: users must be able to read own company
CREATE POLICY "permissive_users_view_own_company"
ON public.companies
FOR SELECT
TO authenticated
USING (id = get_user_company_id(auth.uid()));
