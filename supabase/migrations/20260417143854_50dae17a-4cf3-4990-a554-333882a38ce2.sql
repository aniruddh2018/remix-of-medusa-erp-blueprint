CREATE TABLE public.doctors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  registration_number TEXT,
  speciality TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_doctors_company ON public.doctors(company_id);
CREATE INDEX idx_doctors_reg_num ON public.doctors(company_id, registration_number);
CREATE INDEX idx_doctors_name ON public.doctors(company_id, name);

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own company doctors"
ON public.doctors FOR SELECT
USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Manage own company doctors"
ON public.doctors FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pharmacist'::app_role)
    OR public.is_super_admin(auth.uid()))
  AND company_id = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pharmacist'::app_role)
    OR public.is_super_admin(auth.uid()))
  AND company_id = public.get_user_company_id(auth.uid())
);

CREATE POLICY "Staff insert own company doctors"
ON public.doctors FOR INSERT
WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE TRIGGER update_doctors_updated_at
BEFORE UPDATE ON public.doctors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add doctor fields to sales_orders
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.doctors(id),
  ADD COLUMN IF NOT EXISTS doctor_name TEXT,
  ADD COLUMN IF NOT EXISTS doctor_registration_number TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_orders_doctor ON public.sales_orders(doctor_id);