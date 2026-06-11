
DROP POLICY IF EXISTS query_history_company_isolation ON public.query_history;

DROP POLICY IF EXISTS query_history_admin_read ON public.query_history;
CREATE POLICY query_history_admin_read ON public.query_history
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND company_id = (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
);
