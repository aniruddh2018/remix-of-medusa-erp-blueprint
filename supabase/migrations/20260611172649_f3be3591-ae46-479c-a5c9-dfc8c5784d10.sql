
-- GST Filing prerequisites: state codes & place of supply
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS state_code text,
  ADD COLUMN IF NOT EXISTS state_name text,
  ADD COLUMN IF NOT EXISTS legal_name text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS state_code text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS state_code text;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS place_of_supply text,
  ADD COLUMN IF NOT EXISTS is_interstate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_gstin text;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS place_of_supply text,
  ADD COLUMN IF NOT EXISTS is_interstate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplier_gstin text,
  ADD COLUMN IF NOT EXISTS supplier_invoice_number text,
  ADD COLUMN IF NOT EXISTS supplier_invoice_date date;

ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS place_of_supply text,
  ADD COLUMN IF NOT EXISTS is_interstate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_gstin text,
  ADD COLUMN IF NOT EXISTS note_type text NOT NULL DEFAULT 'C';

ALTER TABLE public.debit_notes
  ADD COLUMN IF NOT EXISTS place_of_supply text,
  ADD COLUMN IF NOT EXISTS is_interstate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplier_gstin text,
  ADD COLUMN IF NOT EXISTS note_type text NOT NULL DEFAULT 'D';

-- Helper: derive state code from GSTIN (first 2 chars)
CREATE OR REPLACE FUNCTION public.gstin_state_code(gstin text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN gstin IS NULL OR length(trim(gstin)) < 2 THEN NULL
    ELSE substring(trim(gstin) FROM 1 FOR 2)
  END;
$$;

-- Backfill state codes from existing GSTINs
UPDATE public.customers
  SET state_code = public.gstin_state_code(gst_number)
  WHERE state_code IS NULL AND gst_number IS NOT NULL;

UPDATE public.suppliers
  SET state_code = public.gstin_state_code(gst_number)
  WHERE state_code IS NULL AND gst_number IS NOT NULL;

UPDATE public.companies
  SET state_code = public.gstin_state_code(gst_number)
  WHERE state_code IS NULL AND gst_number IS NOT NULL;
