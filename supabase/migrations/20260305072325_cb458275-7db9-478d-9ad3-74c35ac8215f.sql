
-- Fix ALL RLS policies: convert from RESTRICTIVE to PERMISSIVE
-- Root cause: all policies were created as RESTRICTIVE, which means
-- with 0 PERMISSIVE policies, PostgreSQL denies ALL access.

-- ===================== user_roles =====================
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view company roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage company roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can manage all roles" ON public.user_roles;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view company roles" ON public.user_roles FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) AND user_id IN (SELECT p.user_id FROM profiles p WHERE p.company_id = get_user_company_id(auth.uid()))
);
CREATE POLICY "Admins can manage company roles" ON public.user_roles FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) AND user_id IN (SELECT p.user_id FROM profiles p WHERE p.company_id = get_user_company_id(auth.uid()))
);
CREATE POLICY "Super admins can manage all roles" ON public.user_roles FOR ALL USING (is_super_admin(auth.uid()));

-- ===================== profiles =====================
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view company profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can manage all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view company profiles" ON public.profiles FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Super admins can manage all profiles" ON public.profiles FOR ALL USING (is_super_admin(auth.uid()));

-- ===================== companies =====================
DROP POLICY IF EXISTS "Users can view own company" ON public.companies;
DROP POLICY IF EXISTS "Admins can update own company" ON public.companies;
DROP POLICY IF EXISTS "Super admins can manage all companies" ON public.companies;

CREATE POLICY "Users can view own company" ON public.companies FOR SELECT USING (id = get_user_company_id(auth.uid()));
CREATE POLICY "Admins can update own company" ON public.companies FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) AND id = get_user_company_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND id = get_user_company_id(auth.uid()));
CREATE POLICY "Super admins can manage all companies" ON public.companies FOR ALL USING (is_super_admin(auth.uid()));

-- ===================== products =====================
DROP POLICY IF EXISTS "View own company products" ON public.products;
DROP POLICY IF EXISTS "Manage own company products" ON public.products;
DROP POLICY IF EXISTS "Staff insert own company products" ON public.products;
DROP POLICY IF EXISTS "Staff update own company products" ON public.products;

CREATE POLICY "View own company products" ON public.products FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company products" ON public.products FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Staff insert own company products" ON public.products FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Staff update own company products" ON public.products FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

-- ===================== suppliers =====================
DROP POLICY IF EXISTS "View own company suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Manage own company suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Staff insert own company suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Staff update own company suppliers" ON public.suppliers;

CREATE POLICY "View own company suppliers" ON public.suppliers FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company suppliers" ON public.suppliers FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Staff insert own company suppliers" ON public.suppliers FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Staff update own company suppliers" ON public.suppliers FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

-- ===================== customers =====================
DROP POLICY IF EXISTS "View own company customers" ON public.customers;
DROP POLICY IF EXISTS "Manage own company customers" ON public.customers;
DROP POLICY IF EXISTS "Staff insert own company customers" ON public.customers;
DROP POLICY IF EXISTS "Staff update own company customers" ON public.customers;

CREATE POLICY "View own company customers" ON public.customers FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company customers" ON public.customers FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Staff insert own company customers" ON public.customers FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Staff update own company customers" ON public.customers FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

-- ===================== inventory_batches =====================
DROP POLICY IF EXISTS "View own company batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "Manage own company batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "Staff insert own company batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "Staff update own company batches" ON public.inventory_batches;

CREATE POLICY "View own company batches" ON public.inventory_batches FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company batches" ON public.inventory_batches FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Staff insert own company batches" ON public.inventory_batches FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Staff update own company batches" ON public.inventory_batches FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

-- ===================== purchase_orders =====================
DROP POLICY IF EXISTS "View own company POs" ON public.purchase_orders;
DROP POLICY IF EXISTS "Manage own company POs" ON public.purchase_orders;
DROP POLICY IF EXISTS "Staff insert own company POs" ON public.purchase_orders;
DROP POLICY IF EXISTS "Staff update own company POs" ON public.purchase_orders;

CREATE POLICY "View own company POs" ON public.purchase_orders FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company POs" ON public.purchase_orders FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Staff insert own company POs" ON public.purchase_orders FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Staff update own company POs" ON public.purchase_orders FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

-- ===================== purchase_order_items =====================
DROP POLICY IF EXISTS "View own company PO items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Manage own company PO items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Staff insert own company PO items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Staff update own company PO items" ON public.purchase_order_items;

CREATE POLICY "View own company PO items" ON public.purchase_order_items FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company PO items" ON public.purchase_order_items FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Staff insert own company PO items" ON public.purchase_order_items FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Staff update own company PO items" ON public.purchase_order_items FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

-- ===================== sales_orders =====================
DROP POLICY IF EXISTS "View own company sales" ON public.sales_orders;
DROP POLICY IF EXISTS "Manage own company sales" ON public.sales_orders;
DROP POLICY IF EXISTS "Staff insert own company sales" ON public.sales_orders;

CREATE POLICY "View own company sales" ON public.sales_orders FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company sales" ON public.sales_orders FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Staff insert own company sales" ON public.sales_orders FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- ===================== sales_order_items =====================
DROP POLICY IF EXISTS "View own company sale items" ON public.sales_order_items;
DROP POLICY IF EXISTS "Manage own company sale items" ON public.sales_order_items;
DROP POLICY IF EXISTS "Staff insert own company sale items" ON public.sales_order_items;

CREATE POLICY "View own company sale items" ON public.sales_order_items FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company sale items" ON public.sales_order_items FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Staff insert own company sale items" ON public.sales_order_items FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- ===================== credit_notes =====================
DROP POLICY IF EXISTS "View own company credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Manage own company credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Staff insert own company credit notes" ON public.credit_notes;

CREATE POLICY "View own company credit notes" ON public.credit_notes FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company credit notes" ON public.credit_notes FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Staff insert own company credit notes" ON public.credit_notes FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- ===================== credit_note_items =====================
DROP POLICY IF EXISTS "View own company CN items" ON public.credit_note_items;
DROP POLICY IF EXISTS "Manage own company CN items" ON public.credit_note_items;
DROP POLICY IF EXISTS "Staff insert own company CN items" ON public.credit_note_items;

CREATE POLICY "View own company CN items" ON public.credit_note_items FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company CN items" ON public.credit_note_items FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Staff insert own company CN items" ON public.credit_note_items FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- ===================== debit_notes =====================
DROP POLICY IF EXISTS "View own company debit notes" ON public.debit_notes;
DROP POLICY IF EXISTS "Manage own company debit notes" ON public.debit_notes;
DROP POLICY IF EXISTS "Staff insert own company debit notes" ON public.debit_notes;

CREATE POLICY "View own company debit notes" ON public.debit_notes FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company debit notes" ON public.debit_notes FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Staff insert own company debit notes" ON public.debit_notes FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- ===================== debit_note_items =====================
DROP POLICY IF EXISTS "View own company DN items" ON public.debit_note_items;
DROP POLICY IF EXISTS "Manage own company DN items" ON public.debit_note_items;
DROP POLICY IF EXISTS "Staff insert own company DN items" ON public.debit_note_items;

CREATE POLICY "View own company DN items" ON public.debit_note_items FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company DN items" ON public.debit_note_items FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Staff insert own company DN items" ON public.debit_note_items FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- ===================== payments =====================
DROP POLICY IF EXISTS "View own company payments" ON public.payments;
DROP POLICY IF EXISTS "Manage own company payments" ON public.payments;
DROP POLICY IF EXISTS "Staff insert own company payments" ON public.payments;

CREATE POLICY "View own company payments" ON public.payments FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company payments" ON public.payments FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Staff insert own company payments" ON public.payments FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- ===================== invoice_settings =====================
DROP POLICY IF EXISTS "View own company invoice settings" ON public.invoice_settings;
DROP POLICY IF EXISTS "Admin manage own company invoice settings" ON public.invoice_settings;
DROP POLICY IF EXISTS "Super admin manage all invoice settings" ON public.invoice_settings;

CREATE POLICY "View own company invoice settings" ON public.invoice_settings FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Admin manage own company invoice settings" ON public.invoice_settings FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company_id(auth.uid())
);
CREATE POLICY "Super admin manage all invoice settings" ON public.invoice_settings FOR ALL USING (is_super_admin(auth.uid()));

-- ===================== scheduled_drug_register =====================
DROP POLICY IF EXISTS "View own company drug register" ON public.scheduled_drug_register;
DROP POLICY IF EXISTS "Manage own company drug register" ON public.scheduled_drug_register;

CREATE POLICY "View own company drug register" ON public.scheduled_drug_register FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company drug register" ON public.scheduled_drug_register FOR ALL USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pharmacist'::app_role)) AND company_id = get_user_company_id(auth.uid())
);

-- ===================== tax_sessions =====================
DROP POLICY IF EXISTS "View own company tax sessions" ON public.tax_sessions;
DROP POLICY IF EXISTS "Manage own company tax sessions" ON public.tax_sessions;

CREATE POLICY "View own company tax sessions" ON public.tax_sessions FOR SELECT USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Manage own company tax sessions" ON public.tax_sessions FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company_id(auth.uid())
);
