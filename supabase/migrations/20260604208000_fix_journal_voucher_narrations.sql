-- ============================================================================
-- Fix: Update existing journal vouchers with wrong "Supplier UUID..." narration
-- ============================================================================

-- Update journal_vouchers narration to use proper supplier names from ledgers
UPDATE public.journal_vouchers jv
SET narration = CASE 
  WHEN jv.narration LIKE 'Purchase from Supplier %' THEN
    'Purchase from ' || COALESCE(l.name, 'Unknown')
  WHEN jv.narration LIKE 'Cash purchase from Supplier %' THEN
    'Cash purchase from ' || COALESCE(l.name, 'Unknown')
  ELSE jv.narration
END
FROM public.ledgers l
WHERE jv.narration LIKE '%Supplier %'
  AND l.id = substring(jv.narration from '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::UUID;

-- Update journal_voucher_lines narration for payable entries
UPDATE public.journal_voucher_lines jvl
SET narration = 'Payable to ' || COALESCE(l.name, 'Unknown')
FROM public.ledgers l
WHERE jvl.narration LIKE 'Payable to Supplier %'
  AND l.id = substring(jvl.narration from '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::UUID;

-- Also fix any lines that have generic expense references
UPDATE public.journal_voucher_lines
SET narration = CASE
  WHEN narration LIKE 'Cash purchase expense%' THEN 'Cash purchase expense'
  WHEN narration LIKE 'Purchase expense%' THEN 'Purchase expense'
  ELSE narration
END
WHERE narration LIKE '%purchase expense%Supplier%' OR narration LIKE '%Supplier%expense%';
