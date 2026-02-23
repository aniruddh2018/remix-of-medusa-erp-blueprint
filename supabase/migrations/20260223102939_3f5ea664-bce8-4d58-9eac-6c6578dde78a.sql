
-- Create invoice_settings table to store per-company invoice format configuration
CREATE TABLE public.invoice_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
  company_name text NOT NULL DEFAULT '',
  company_address text DEFAULT '',
  company_phone text DEFAULT '',
  company_email text DEFAULT '',
  company_gstin text DEFAULT '',
  company_state text DEFAULT '',
  logo_url text DEFAULT '',
  invoice_prefix text DEFAULT 'INV-',
  terms_and_conditions text DEFAULT 'Thanks for doing business with us!',
  show_ship_to boolean DEFAULT true,
  show_due_date boolean DEFAULT true,
  show_previous_balance boolean DEFAULT true,
  show_tax_summary boolean DEFAULT true,
  show_amount_in_words boolean DEFAULT true,
  invoice_format text DEFAULT 'standard',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "View own company invoice settings"
ON public.invoice_settings FOR SELECT
USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Admin manage own company invoice settings"
ON public.invoice_settings FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admin manage all invoice settings"
ON public.invoice_settings FOR ALL
USING (is_super_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_invoice_settings_updated_at
BEFORE UPDATE ON public.invoice_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
