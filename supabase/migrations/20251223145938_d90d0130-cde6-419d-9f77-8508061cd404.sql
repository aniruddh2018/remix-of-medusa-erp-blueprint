-- Create customers table for storing customer data
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT,
  address TEXT,
  notes TEXT,
  total_purchases NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Authenticated users can view customers" 
ON public.customers 
FOR SELECT 
USING (true);

CREATE POLICY "Staff can create customers" 
ON public.customers 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Staff can update customers" 
ON public.customers 
FOR UPDATE 
USING (true);

CREATE POLICY "Admins can manage customers" 
ON public.customers 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Pharmacists can manage customers" 
ON public.customers 
FOR ALL 
USING (has_role(auth.uid(), 'pharmacist'::app_role));

-- Add customer_id to sales_orders for linking
ALTER TABLE public.sales_orders 
ADD COLUMN customer_id UUID REFERENCES public.customers(id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();