
DROP POLICY IF EXISTS "prescriptions_company_select" ON public.prescriptions;
DROP POLICY IF EXISTS "prescriptions_company_insert" ON public.prescriptions;
DROP POLICY IF EXISTS "prescriptions_company_update" ON public.prescriptions;
DROP POLICY IF EXISTS "prescriptions_company_delete" ON public.prescriptions;

DROP POLICY IF EXISTS prescriptions_select ON public.prescriptions;
CREATE POLICY "prescriptions_select" ON public.prescriptions
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS prescriptions_insert ON public.prescriptions;
CREATE POLICY "prescriptions_insert" ON public.prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS prescriptions_update ON public.prescriptions;
CREATE POLICY "prescriptions_update" ON public.prescriptions
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS prescriptions_delete ON public.prescriptions;
CREATE POLICY "prescriptions_delete" ON public.prescriptions
  FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "prescription_items_company_all" ON public.prescription_items;

DROP POLICY IF EXISTS prescription_items_all ON public.prescription_items;
CREATE POLICY "prescription_items_all" ON public.prescription_items
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
