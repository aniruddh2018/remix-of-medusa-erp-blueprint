DROP POLICY IF EXISTS ledgers_insert_company_members ON public.ledgers;
CREATE POLICY "ledgers_insert_company_members" ON public.ledgers FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id(auth.uid()));
DROP POLICY IF EXISTS ledger_groups_insert_company_members ON public.ledger_groups;
CREATE POLICY "ledger_groups_insert_company_members" ON public.ledger_groups FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id(auth.uid()));
DROP POLICY IF EXISTS ledger_roles_insert_company_members ON public.ledger_roles;
CREATE POLICY "ledger_roles_insert_company_members" ON public.ledger_roles FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id(auth.uid()));
DROP POLICY IF EXISTS ledgers_update_company_members ON public.ledgers;
CREATE POLICY "ledgers_update_company_members" ON public.ledgers FOR UPDATE TO authenticated USING (company_id = get_user_company_id(auth.uid())) WITH CHECK (company_id = get_user_company_id(auth.uid()));