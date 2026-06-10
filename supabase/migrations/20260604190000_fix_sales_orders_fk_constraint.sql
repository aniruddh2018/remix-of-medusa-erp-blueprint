-- ============================================================================
-- Fix: Sales Orders FK Constraint — Allow customer_id to reference ledgers
-- ============================================================================

-- Drop the old FK constraint that references customers table
-- (we now use ledgers as the unified customer/supplier master)
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_customer_id_fkey;

-- Make customer_id nullable (sales can reference ledgers via ledger_id or just use customer_name)
ALTER TABLE public.sales_orders ALTER COLUMN customer_id DROP NOT NULL;

-- Add comment explaining the new relationship
COMMENT ON COLUMN public.sales_orders.customer_id IS 
  'Legacy reference to customers table. New code should use ledger_id for unified ledger linking.';

-- Ensure ledger_id column exists and can reference ledgers
-- (this was added in 20260602160000_add_journal_vouchers.sql but let's ensure it's properly set up)
DO $$
BEGIN
  -- Column already exists from previous migration, just ensure it's indexed
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_sales_orders_ledger_id'
  ) THEN
    CREATE INDEX idx_sales_orders_ledger_id ON public.sales_orders(ledger_id);
  END IF;
END $$;

-- ============================================================================
-- Same fix for purchase_orders
-- ============================================================================

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey;

COMMENT ON COLUMN public.purchase_orders.supplier_id IS 
  'Legacy reference to suppliers table. New code should use ledger_id for unified ledger linking.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_purchase_orders_ledger_id'
  ) THEN
    CREATE INDEX idx_purchase_orders_ledger_id ON public.purchase_orders(ledger_id);
  END IF;
END $$;
