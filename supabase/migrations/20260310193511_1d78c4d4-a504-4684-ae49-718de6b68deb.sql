
-- Fix ALL RLS policies: Convert from RESTRICTIVE to PERMISSIVE
-- The current RESTRICTIVE-only setup silently blocks DELETE/UPDATE operations

-- ==================== sales_orders ====================
DROP POLICY IF EXISTS "Manage own company sales" ON public.sales_orders;
DROP POLICY IF EXISTS "Staff insert own company sales" ON public.sales_orders;
DROP POLICY IF EXISTS "View own company sales" ON public.sales_orders;

CREATE POLICY "Manage own company sales" ON public.sales_orders
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff insert own company sales" ON public.sales_orders
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company sales" ON public.sales_orders
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== sales_order_items ====================
DROP POLICY IF EXISTS "Manage own company sale items" ON public.sales_order_items;
DROP POLICY IF EXISTS "Staff insert own company sale items" ON public.sales_order_items;
DROP POLICY IF EXISTS "View own company sale items" ON public.sales_order_items;

CREATE POLICY "Manage own company sale items" ON public.sales_order_items
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff insert own company sale items" ON public.sales_order_items
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company sale items" ON public.sales_order_items
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== payments ====================
DROP POLICY IF EXISTS "Manage own company payments" ON public.payments;
DROP POLICY IF EXISTS "Staff insert own company payments" ON public.payments;
DROP POLICY IF EXISTS "View own company payments" ON public.payments;

CREATE POLICY "Manage own company payments" ON public.payments
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff insert own company payments" ON public.payments
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company payments" ON public.payments
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== inventory_batches ====================
DROP POLICY IF EXISTS "Manage own company batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "Staff insert own company batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "Staff update own company batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "View own company batches" ON public.inventory_batches;

CREATE POLICY "Manage own company batches" ON public.inventory_batches
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff insert own company batches" ON public.inventory_batches
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff update own company batches" ON public.inventory_batches
  AS PERMISSIVE FOR UPDATE TO public
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company batches" ON public.inventory_batches
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== credit_notes ====================
DROP POLICY IF EXISTS "Manage own company credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Staff insert own company credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "View own company credit notes" ON public.credit_notes;

CREATE POLICY "Manage own company credit notes" ON public.credit_notes
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff insert own company credit notes" ON public.credit_notes
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company credit notes" ON public.credit_notes
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== credit_note_items ====================
DROP POLICY IF EXISTS "Manage own company CN items" ON public.credit_note_items;
DROP POLICY IF EXISTS "Staff insert own company CN items" ON public.credit_note_items;
DROP POLICY IF EXISTS "View own company CN items" ON public.credit_note_items;

CREATE POLICY "Manage own company CN items" ON public.credit_note_items
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff insert own company CN items" ON public.credit_note_items
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company CN items" ON public.credit_note_items
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== debit_notes ====================
DROP POLICY IF EXISTS "Manage own company debit notes" ON public.debit_notes;
DROP POLICY IF EXISTS "Staff insert own company debit notes" ON public.debit_notes;
DROP POLICY IF EXISTS "View own company debit notes" ON public.debit_notes;

CREATE POLICY "Manage own company debit notes" ON public.debit_notes
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff insert own company debit notes" ON public.debit_notes
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company debit notes" ON public.debit_notes
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== debit_note_items ====================
DROP POLICY IF EXISTS "Manage own company DN items" ON public.debit_note_items;
DROP POLICY IF EXISTS "Staff insert own company DN items" ON public.debit_note_items;
DROP POLICY IF EXISTS "View own company DN items" ON public.debit_note_items;

CREATE POLICY "Manage own company DN items" ON public.debit_note_items
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff insert own company DN items" ON public.debit_note_items
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company DN items" ON public.debit_note_items
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== products ====================
DROP POLICY IF EXISTS "Manage own company products" ON public.products;
DROP POLICY IF EXISTS "Staff insert own company products" ON public.products;
DROP POLICY IF EXISTS "Staff update own company products" ON public.products;
DROP POLICY IF EXISTS "View own company products" ON public.products;

CREATE POLICY "Manage own company products" ON public.products
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff insert own company products" ON public.products
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff update own company products" ON public.products
  AS PERMISSIVE FOR UPDATE TO public
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company products" ON public.products
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== customers ====================
DROP POLICY IF EXISTS "Manage own company customers" ON public.customers;
DROP POLICY IF EXISTS "Staff insert own company customers" ON public.customers;
DROP POLICY IF EXISTS "Staff update own company customers" ON public.customers;
DROP POLICY IF EXISTS "View own company customers" ON public.customers;

CREATE POLICY "Manage own company customers" ON public.customers
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff insert own company customers" ON public.customers
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff update own company customers" ON public.customers
  AS PERMISSIVE FOR UPDATE TO public
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company customers" ON public.customers
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== suppliers ====================
DROP POLICY IF EXISTS "Manage own company suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Staff insert own company suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Staff update own company suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "View own company suppliers" ON public.suppliers;

CREATE POLICY "Manage own company suppliers" ON public.suppliers
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff insert own company suppliers" ON public.suppliers
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff update own company suppliers" ON public.suppliers
  AS PERMISSIVE FOR UPDATE TO public
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company suppliers" ON public.suppliers
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== purchase_orders ====================
DROP POLICY IF EXISTS "Manage own company POs" ON public.purchase_orders;
DROP POLICY IF EXISTS "Staff insert own company POs" ON public.purchase_orders;
DROP POLICY IF EXISTS "Staff update own company POs" ON public.purchase_orders;
DROP POLICY IF EXISTS "View own company POs" ON public.purchase_orders;

CREATE POLICY "Manage own company POs" ON public.purchase_orders
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff insert own company POs" ON public.purchase_orders
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff update own company POs" ON public.purchase_orders
  AS PERMISSIVE FOR UPDATE TO public
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company POs" ON public.purchase_orders
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== purchase_order_items ====================
DROP POLICY IF EXISTS "Manage own company PO items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Staff insert own company PO items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Staff update own company PO items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "View own company PO items" ON public.purchase_order_items;

CREATE POLICY "Manage own company PO items" ON public.purchase_order_items
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Staff insert own company PO items" ON public.purchase_order_items
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff update own company PO items" ON public.purchase_order_items
  AS PERMISSIVE FOR UPDATE TO public
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company PO items" ON public.purchase_order_items
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== scheduled_drug_register ====================
DROP POLICY IF EXISTS "Manage own company drug register" ON public.scheduled_drug_register;
DROP POLICY IF EXISTS "View own company drug register" ON public.scheduled_drug_register;

CREATE POLICY "Manage own company drug register" ON public.scheduled_drug_register
  AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "View own company drug register" ON public.scheduled_drug_register
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== tax_sessions ====================
DROP POLICY IF EXISTS "Manage own company tax sessions" ON public.tax_sessions;
DROP POLICY IF EXISTS "View own company tax sessions" ON public.tax_sessions;

CREATE POLICY "Manage own company tax sessions" ON public.tax_sessions
  AS PERMISSIVE FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role) AND (company_id = get_user_company_id(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "View own company tax sessions" ON public.tax_sessions
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- ==================== companies ====================
DROP POLICY IF EXISTS "Admins can update own company" ON public.companies;
DROP POLICY IF EXISTS "Super admins can manage all companies" ON public.companies;
DROP POLICY IF EXISTS "Users can view own company" ON public.companies;

CREATE POLICY "Admins can update own company" ON public.companies
  AS PERMISSIVE FOR UPDATE TO public
  USING (has_role(auth.uid(), 'admin'::app_role) AND (id = get_user_company_id(auth.uid())));

CREATE POLICY "Super admins can manage all companies" ON public.companies
  AS PERMISSIVE FOR ALL TO public
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Users can view own company" ON public.companies
  AS PERMISSIVE FOR SELECT TO public
  USING (id = get_user_company_id(auth.uid()));

-- ==================== profiles ====================
DROP POLICY IF EXISTS "Admins can view company profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Admins can view company profiles" ON public.profiles
  AS PERMISSIVE FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Super admins can manage all profiles" ON public.profiles
  AS PERMISSIVE FOR ALL TO public
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Users can insert own profile" ON public.profiles
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO public
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own profile" ON public.profiles
  AS PERMISSIVE FOR SELECT TO public
  USING (auth.uid() = user_id);

-- ==================== user_roles ====================
DROP POLICY IF EXISTS "Admins can manage company roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Admins can manage company roles" ON public.user_roles
  AS PERMISSIVE FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role) AND (user_id IN (SELECT p.user_id FROM profiles p WHERE p.company_id = get_user_company_id(auth.uid()))));

CREATE POLICY "Super admins can manage all roles" ON public.user_roles
  AS PERMISSIVE FOR ALL TO public
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Users can view own roles" ON public.user_roles
  AS PERMISSIVE FOR SELECT TO public
  USING (auth.uid() = user_id);

-- ==================== invoice_settings ====================
DROP POLICY IF EXISTS "Admin manage own company invoice settings" ON public.invoice_settings;
DROP POLICY IF EXISTS "Super admin manage all invoice settings" ON public.invoice_settings;
DROP POLICY IF EXISTS "View own company invoice settings" ON public.invoice_settings;

CREATE POLICY "Admin manage own company invoice settings" ON public.invoice_settings
  AS PERMISSIVE FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role) AND (company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Super admin manage all invoice settings" ON public.invoice_settings
  AS PERMISSIVE FOR ALL TO public
  USING (is_super_admin(auth.uid()));

CREATE POLICY "View own company invoice settings" ON public.invoice_settings
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));
