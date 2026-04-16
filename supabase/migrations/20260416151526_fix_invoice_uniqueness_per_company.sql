-- Fix invoice number uniqueness to be per company instead of global
-- This prevents duplicate key errors when multiple companies generate invoices

-- Ensure sales_orders has per-company unique constraint on (company_id, invoice_number)
DO $$
BEGIN
  -- Drop any global unique constraint on invoice_number if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'sales_orders'
      AND tc.constraint_type = 'UNIQUE'
      AND kcu.column_name = 'invoice_number'
      AND tc.constraint_name NOT LIKE '%company%'
  ) THEN
    -- Find and drop the global constraint
    EXECUTE (
      SELECT 'ALTER TABLE public.sales_orders DROP CONSTRAINT ' || tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'sales_orders'
        AND tc.constraint_type = 'UNIQUE'
        AND kcu.column_name = 'invoice_number'
        AND tc.constraint_name NOT LIKE '%company%'
      LIMIT 1
    );
  END IF;

  -- Add per-company unique constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sales_orders'
      AND constraint_name = 'sales_orders_company_invoice_unique'
  ) THEN
    ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_company_invoice_unique UNIQUE (company_id, invoice_number);
  END IF;
END $$;

-- Also fix purchase_orders
DO $$
BEGIN
  -- Drop any global unique constraint on invoice_number if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'purchase_orders'
      AND tc.constraint_type = 'UNIQUE'
      AND kcu.column_name = 'invoice_number'
      AND tc.constraint_name NOT LIKE '%company%'
  ) THEN
    -- Find and drop the global constraint
    EXECUTE (
      SELECT 'ALTER TABLE public.purchase_orders DROP CONSTRAINT ' || tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'purchase_orders'
        AND tc.constraint_type = 'UNIQUE'
        AND kcu.column_name = 'invoice_number'
        AND tc.constraint_name NOT LIKE '%company%'
      LIMIT 1
    );
  END IF;

  -- Add per-company unique constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'purchase_orders'
      AND constraint_name = 'purchase_orders_company_invoice_unique'
  ) THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_company_invoice_unique UNIQUE (company_id, invoice_number);
  END IF;
END $$;