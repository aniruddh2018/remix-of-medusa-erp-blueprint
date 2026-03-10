
-- Fix: Add super_admin to all "Manage" policies so super admins can delete/update

-- sales_orders
DROP POLICY IF EXISTS "Manage own company sales" ON public.sales_orders;
CREATE POLICY "Manage own company sales" ON public.sales_orders
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- sales_order_items
DROP POLICY IF EXISTS "Manage own company sale items" ON public.sales_order_items;
CREATE POLICY "Manage own company sale items" ON public.sales_order_items
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- payments
DROP POLICY IF EXISTS "Manage own company payments" ON public.payments;
CREATE POLICY "Manage own company payments" ON public.payments
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- inventory_batches
DROP POLICY IF EXISTS "Manage own company batches" ON public.inventory_batches;
CREATE POLICY "Manage own company batches" ON public.inventory_batches
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- credit_notes
DROP POLICY IF EXISTS "Manage own company credit notes" ON public.credit_notes;
CREATE POLICY "Manage own company credit notes" ON public.credit_notes
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- credit_note_items
DROP POLICY IF EXISTS "Manage own company CN items" ON public.credit_note_items;
CREATE POLICY "Manage own company CN items" ON public.credit_note_items
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- debit_notes
DROP POLICY IF EXISTS "Manage own company debit notes" ON public.debit_notes;
CREATE POLICY "Manage own company debit notes" ON public.debit_notes
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- debit_note_items
DROP POLICY IF EXISTS "Manage own company DN items" ON public.debit_note_items;
CREATE POLICY "Manage own company DN items" ON public.debit_note_items
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- products
DROP POLICY IF EXISTS "Manage own company products" ON public.products;
CREATE POLICY "Manage own company products" ON public.products
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- customers
DROP POLICY IF EXISTS "Manage own company customers" ON public.customers;
CREATE POLICY "Manage own company customers" ON public.customers
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- suppliers
DROP POLICY IF EXISTS "Manage own company suppliers" ON public.suppliers;
CREATE POLICY "Manage own company suppliers" ON public.suppliers
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- purchase_orders
DROP POLICY IF EXISTS "Manage own company POs" ON public.purchase_orders;
CREATE POLICY "Manage own company POs" ON public.purchase_orders
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- purchase_order_items
DROP POLICY IF EXISTS "Manage own company PO items" ON public.purchase_order_items;
CREATE POLICY "Manage own company PO items" ON public.purchase_order_items
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- scheduled_drug_register
DROP POLICY IF EXISTS "Manage own company drug register" ON public.scheduled_drug_register;
CREATE POLICY "Manage own company drug register" ON public.scheduled_drug_register
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));

-- tax_sessions
DROP POLICY IF EXISTS "Manage own company tax sessions" ON public.tax_sessions;
CREATE POLICY "Manage own company tax sessions" ON public.tax_sessions
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) AND (company_id = get_user_company_id(auth.uid())));
