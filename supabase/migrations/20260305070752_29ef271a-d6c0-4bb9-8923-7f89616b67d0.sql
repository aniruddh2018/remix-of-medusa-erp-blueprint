DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'companies'
      AND policyname = 'Admins can update own company'
  ) THEN
    CREATE POLICY "Admins can update own company"
    ON public.companies
    FOR UPDATE
    USING (
      has_role(auth.uid(), 'admin'::public.app_role)
      AND id = get_user_company_id(auth.uid())
    )
    WITH CHECK (
      has_role(auth.uid(), 'admin'::public.app_role)
      AND id = get_user_company_id(auth.uid())
    );
  END IF;
END
$$;