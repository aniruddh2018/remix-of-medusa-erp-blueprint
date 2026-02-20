
-- Payments table: tracks payments for sales orders and purchase orders
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_type text NOT NULL CHECK (payment_type IN ('received', 'made')),
  reference_type text NOT NULL CHECK (reference_type IN ('sales_order', 'purchase_order', 'credit_note', 'debit_note')),
  reference_id uuid NOT NULL,
  reference_number text NOT NULL,
  party_name text NOT NULL,
  party_type text NOT NULL CHECK (party_type IN ('customer', 'supplier')),
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'upi', 'bank_transfer', 'cheque', 'card', 'other')),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  cheque_number text,
  bank_name text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payments"
  ON public.payments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Pharmacists can manage payments"
  ON public.payments FOR ALL
  USING (has_role(auth.uid(), 'pharmacist'::app_role));

CREATE POLICY "Authenticated users can view payments"
  ON public.payments FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create payments"
  ON public.payments FOR INSERT
  WITH CHECK (true);

-- Tax sessions: monthly GST periods for tracking open/closed periods
CREATE TABLE public.tax_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_name text NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year integer NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filed', 'locked')),
  output_gst numeric NOT NULL DEFAULT 0,
  input_gst numeric NOT NULL DEFAULT 0,
  net_tax_liability numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (period_month, period_year)
);

ALTER TABLE public.tax_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tax sessions"
  ON public.tax_sessions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Pharmacists can view tax sessions"
  ON public.tax_sessions FOR SELECT
  USING (has_role(auth.uid(), 'pharmacist'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at on payments
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on tax_sessions
CREATE TRIGGER update_tax_sessions_updated_at
  BEFORE UPDATE ON public.tax_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
