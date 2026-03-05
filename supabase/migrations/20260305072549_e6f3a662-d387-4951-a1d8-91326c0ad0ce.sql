
-- Allow authenticated users without a company to create one (for onboarding)
CREATE POLICY "Authenticated users can create a company during onboarding"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (
  get_user_company_id(auth.uid()) IS NULL
);
