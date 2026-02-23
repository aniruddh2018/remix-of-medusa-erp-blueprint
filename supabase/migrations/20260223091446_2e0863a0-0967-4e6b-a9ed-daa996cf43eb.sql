
-- 2. Create companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_type text NOT NULL DEFAULT 'pharmacy',
  gst_number text,
  address text,
  phone text,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 3. Add company_id to profiles and all data tables
ALTER TABLE public.profiles ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.products ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.inventory_batches ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.suppliers ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.customers ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.purchase_orders ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.purchase_order_items ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.sales_orders ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.sales_order_items ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.payments ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.credit_notes ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.credit_note_items ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.debit_notes ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.debit_note_items ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.scheduled_drug_register ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.tax_sessions ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- 4. Helper functions
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT company_id FROM public.profiles WHERE user_id = _user_id LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin') $$;

-- 5. Companies RLS
CREATE POLICY "Super admins can manage all companies"
  ON public.companies FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view own company"
  ON public.companies FOR SELECT TO authenticated
  USING (id = public.get_user_company_id(auth.uid()));

-- 6. Drop old + create tenant-aware policies

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Super admins can manage all profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Admins can view company profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND company_id = public.get_user_company_id(auth.uid()));

-- products
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Pharmacists can manage products" ON public.products;
DROP POLICY IF EXISTS "Staff can create products" ON public.products;
DROP POLICY IF EXISTS "Staff can update products" ON public.products;

CREATE POLICY "View own company products" ON public.products FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company products" ON public.products FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff insert own company products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff update own company products" ON public.products FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- suppliers
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Admins can manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Pharmacists can manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Staff can create suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Staff can update suppliers" ON public.suppliers;

CREATE POLICY "View own company suppliers" ON public.suppliers FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company suppliers" ON public.suppliers FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff insert own company suppliers" ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff update own company suppliers" ON public.suppliers FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- customers
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Pharmacists can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can create customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can update customers" ON public.customers;

CREATE POLICY "View own company customers" ON public.customers FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company customers" ON public.customers FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff insert own company customers" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff update own company customers" ON public.customers FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- purchase_orders
DROP POLICY IF EXISTS "Authenticated users can view purchase orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Admins can manage purchase orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Pharmacists can manage purchase orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Staff can create purchase orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Staff can update purchase orders" ON public.purchase_orders;

CREATE POLICY "View own company POs" ON public.purchase_orders FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company POs" ON public.purchase_orders FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff insert own company POs" ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff update own company POs" ON public.purchase_orders FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- purchase_order_items
DROP POLICY IF EXISTS "Authenticated users can view purchase order items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Admins can manage purchase order items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Pharmacists can manage purchase order items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Staff can create purchase order items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Staff can update purchase order items" ON public.purchase_order_items;

CREATE POLICY "View own company PO items" ON public.purchase_order_items FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company PO items" ON public.purchase_order_items FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff insert own company PO items" ON public.purchase_order_items FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff update own company PO items" ON public.purchase_order_items FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- sales_orders
DROP POLICY IF EXISTS "Authenticated users can view sales orders" ON public.sales_orders;
DROP POLICY IF EXISTS "Admins can manage sales orders" ON public.sales_orders;
DROP POLICY IF EXISTS "Pharmacists can manage sales orders" ON public.sales_orders;
DROP POLICY IF EXISTS "Authenticated users can create sales orders" ON public.sales_orders;

CREATE POLICY "View own company sales" ON public.sales_orders FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company sales" ON public.sales_orders FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff insert own company sales" ON public.sales_orders FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- sales_order_items
DROP POLICY IF EXISTS "Authenticated users can view sales order items" ON public.sales_order_items;
DROP POLICY IF EXISTS "Admins can manage sales order items" ON public.sales_order_items;
DROP POLICY IF EXISTS "Pharmacists can manage sales order items" ON public.sales_order_items;
DROP POLICY IF EXISTS "Authenticated users can create sales order items" ON public.sales_order_items;

CREATE POLICY "View own company sale items" ON public.sales_order_items FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company sale items" ON public.sales_order_items FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff insert own company sale items" ON public.sales_order_items FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- inventory_batches
DROP POLICY IF EXISTS "Authenticated users can view batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "Admins can manage batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "Pharmacists can manage batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "Staff can create batches" ON public.inventory_batches;
DROP POLICY IF EXISTS "Staff can update batches" ON public.inventory_batches;

CREATE POLICY "View own company batches" ON public.inventory_batches FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company batches" ON public.inventory_batches FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff insert own company batches" ON public.inventory_batches FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff update own company batches" ON public.inventory_batches FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- payments
DROP POLICY IF EXISTS "Authenticated users can view payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Pharmacists can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated users can create payments" ON public.payments;

CREATE POLICY "View own company payments" ON public.payments FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company payments" ON public.payments FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff insert own company payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- credit_notes
DROP POLICY IF EXISTS "Authenticated users can view credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Admins can manage credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Pharmacists can manage credit notes" ON public.credit_notes;
DROP POLICY IF EXISTS "Authenticated users can create credit notes" ON public.credit_notes;

CREATE POLICY "View own company credit notes" ON public.credit_notes FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company credit notes" ON public.credit_notes FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff insert own company credit notes" ON public.credit_notes FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- credit_note_items
DROP POLICY IF EXISTS "Authenticated users can view credit note items" ON public.credit_note_items;
DROP POLICY IF EXISTS "Admins can manage credit note items" ON public.credit_note_items;
DROP POLICY IF EXISTS "Pharmacists can manage credit note items" ON public.credit_note_items;
DROP POLICY IF EXISTS "Authenticated users can create credit note items" ON public.credit_note_items;

CREATE POLICY "View own company CN items" ON public.credit_note_items FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company CN items" ON public.credit_note_items FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff insert own company CN items" ON public.credit_note_items FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- debit_notes
DROP POLICY IF EXISTS "Authenticated users can view debit notes" ON public.debit_notes;
DROP POLICY IF EXISTS "Admins can manage debit notes" ON public.debit_notes;
DROP POLICY IF EXISTS "Pharmacists can manage debit notes" ON public.debit_notes;
DROP POLICY IF EXISTS "Authenticated users can create debit notes" ON public.debit_notes;

CREATE POLICY "View own company debit notes" ON public.debit_notes FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company debit notes" ON public.debit_notes FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff insert own company debit notes" ON public.debit_notes FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- debit_note_items
DROP POLICY IF EXISTS "Authenticated users can view debit note items" ON public.debit_note_items;
DROP POLICY IF EXISTS "Admins can manage debit note items" ON public.debit_note_items;
DROP POLICY IF EXISTS "Pharmacists can manage debit note items" ON public.debit_note_items;
DROP POLICY IF EXISTS "Authenticated users can create debit note items" ON public.debit_note_items;

CREATE POLICY "View own company DN items" ON public.debit_note_items FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company DN items" ON public.debit_note_items FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Staff insert own company DN items" ON public.debit_note_items FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- scheduled_drug_register
DROP POLICY IF EXISTS "Authenticated users can view drug register" ON public.scheduled_drug_register;
DROP POLICY IF EXISTS "Admins can manage drug register" ON public.scheduled_drug_register;
DROP POLICY IF EXISTS "Pharmacists can manage drug register" ON public.scheduled_drug_register;
DROP POLICY IF EXISTS "Pharmacists can insert drug register entries" ON public.scheduled_drug_register;

CREATE POLICY "View own company drug register" ON public.scheduled_drug_register FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company drug register" ON public.scheduled_drug_register FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist')) AND company_id = public.get_user_company_id(auth.uid()));

-- tax_sessions
DROP POLICY IF EXISTS "Admins can manage tax sessions" ON public.tax_sessions;
DROP POLICY IF EXISTS "Pharmacists can view tax sessions" ON public.tax_sessions;

CREATE POLICY "View own company tax sessions" ON public.tax_sessions FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Manage own company tax sessions" ON public.tax_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND company_id = public.get_user_company_id(auth.uid()));

-- user_roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Super admins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Admins can view company roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND user_id IN (SELECT p.user_id FROM public.profiles p WHERE p.company_id = public.get_user_company_id(auth.uid())));
CREATE POLICY "Admins can manage company roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND user_id IN (SELECT p.user_id FROM public.profiles p WHERE p.company_id = public.get_user_company_id(auth.uid())));

-- Trigger
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
