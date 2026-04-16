-- Fix invoice number uniqueness to be per company instead of global
-- This prevents duplicate key errors when multiple companies generate invoices

-- Ensure sales_orders has per-company unique constraint on (company_id, invoice_number)
DO $$
DECLARE
  dup_record RECORD;
  counter INTEGER := 1;
BEGIN
  -- First, handle duplicates by appending suffixes to make them unique
  FOR dup_record IN
    SELECT company_id, invoice_number, id
    FROM public.sales_orders
    WHERE (company_id, invoice_number) IN (
      SELECT company_id, invoice_number
      FROM public.sales_orders
      GROUP BY company_id, invoice_number
      HAVING COUNT(*) > 1
    )
    ORDER BY company_id, invoice_number, created_at DESC
  LOOP
    -- Update duplicates (skip the first one, which should be the most recent)
    UPDATE public.sales_orders
    SET invoice_number = invoice_number || '-DUP' || counter
    WHERE id = dup_record.id
      AND NOT EXISTS (
        SELECT 1 FROM public.sales_orders so2
        WHERE so2.company_id = dup_record.company_id
          AND so2.invoice_number = dup_record.invoice_number
          AND so2.created_at > dup_record.created_at
      );

    counter := counter + 1;
    IF counter > 100 THEN
      RAISE EXCEPTION 'Too many duplicates found in sales_orders';
    END IF;
  END LOOP;

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
DECLARE
  dup_record RECORD;
  counter INTEGER := 1;
BEGIN
  -- First, handle duplicates by appending suffixes to make them unique
  FOR dup_record IN
    SELECT company_id, invoice_number, id
    FROM public.purchase_orders
    WHERE (company_id, invoice_number) IN (
      SELECT company_id, invoice_number
      FROM public.purchase_orders
      WHERE invoice_number IS NOT NULL
      GROUP BY company_id, invoice_number
      HAVING COUNT(*) > 1
    )
    ORDER BY company_id, invoice_number, created_at DESC
  LOOP
    -- Update duplicates (skip the first one, which should be the most recent)
    UPDATE public.purchase_orders
    SET invoice_number = invoice_number || '-DUP' || counter
    WHERE id = dup_record.id
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_orders po2
        WHERE po2.company_id = dup_record.company_id
          AND po2.invoice_number = dup_record.invoice_number
          AND po2.created_at > dup_record.created_at
      );

    counter := counter + 1;
    IF counter > 100 THEN
      RAISE EXCEPTION 'Too many duplicates found in purchase_orders';
    END IF;
  END LOOP;

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