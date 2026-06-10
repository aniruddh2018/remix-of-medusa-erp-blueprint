-- ============================================================================
-- Fix: Inventory Batches FK — Migrate supplier_id to ledger_id
-- ============================================================================

-- 1. Drop the old FK constraint that references suppliers table
ALTER TABLE public.inventory_batches 
DROP CONSTRAINT IF EXISTS inventory_batches_supplier_id_fkey;

-- 2. Add ledger_id column that references the unified ledgers table
ALTER TABLE public.inventory_batches 
ADD COLUMN IF NOT EXISTS ledger_id UUID REFERENCES public.ledgers(id) ON DELETE SET NULL;

-- 3. Create index for ledger_id
CREATE INDEX IF NOT EXISTS idx_inventory_batches_ledger_id 
ON public.inventory_batches(ledger_id);

-- 4. Migrate existing data: try to match supplier_id to ledger_id
-- This is a best-effort migration for existing data
UPDATE public.inventory_batches ib
SET ledger_id = l.id
FROM public.ledgers l
WHERE ib.supplier_id IS NOT NULL 
  AND ib.ledger_id IS NULL
  AND l.id = ib.supplier_id;  -- Only works if supplier was already migrated to ledger

-- 5. Note: supplier_id is kept for backward compatibility but no longer has FK constraint
-- The application should migrate to using ledger_id for new batches

-- 6. Add comment explaining the change
COMMENT ON COLUMN public.inventory_batches.supplier_id IS 
  'Legacy supplier reference. New code should use ledger_id which references the unified ledgers table.';

COMMENT ON COLUMN public.inventory_batches.ledger_id IS 
  'Reference to unified ledger (supplier). Use this for new code.';
