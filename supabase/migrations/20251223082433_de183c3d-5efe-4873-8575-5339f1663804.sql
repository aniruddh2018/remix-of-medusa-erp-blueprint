-- Add strength and composition fields to products for drug categorization
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS strength text,
ADD COLUMN IF NOT EXISTS composition text;

-- Add other charges columns to purchase_orders
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS freight_charges numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS handling_charges numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_charges numeric NOT NULL DEFAULT 0;

-- Add other charges columns to sales_orders
ALTER TABLE public.sales_orders
ADD COLUMN IF NOT EXISTS freight_charges numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS handling_charges numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS delivery_charges numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_charges numeric NOT NULL DEFAULT 0;