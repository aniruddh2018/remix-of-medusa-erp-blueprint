-- Fix invoice number uniqueness to be per company instead of global
-- This prevents duplicate key errors when multiple companies generate invoices

-- Drop the global unique constraint on invoice_number
ALTER TABLE public.sales_orders DROP CONSTRAINT sales_orders_invoice_number_key;

-- Add unique constraint on (company_id, invoice_number)
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_company_invoice_unique UNIQUE (company_id, invoice_number);

-- Also fix purchase_orders if it has the same issue
-- Check if purchase_orders has global unique on invoice_number
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'purchase_orders'
    AND constraint_name LIKE '%invoice_number%'
    AND constraint_type = 'UNIQUE'
    AND constraint_name NOT LIKE '%company%'
  ) THEN
    -- Drop global unique and add per-company unique
    ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_invoice_number_key;
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_company_invoice_unique UNIQUE (company_id, invoice_number);
  END IF;
END $$;