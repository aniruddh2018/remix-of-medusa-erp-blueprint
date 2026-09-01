-- ============================================================================
-- Fix: Merge fake "Supplier UUID..." ledger into real medikab lifescience pvt. ltd. ledger
-- ============================================================================

-- Disable triggers temporarily to prevent FK violations
ALTER TABLE public.journal_voucher_lines DISABLE TRIGGER trg_recalculate_balance;
ALTER TABLE public.ledgers DISABLE TRIGGER trg_ledger_audit;
ALTER TABLE public.ledgers DISABLE TRIGGER trg_ledgers_updated;

-- 1. Delete audit log entries for fake ledger
DELETE FROM public.ledger_audit_log
WHERE ledger_id = '92def401-5654-4698-a6e2-705cafa0aa2f';

-- 2. Update journal_voucher_lines to use real ledger ID instead of fake one
UPDATE public.journal_voucher_lines
SET ledger_id = '77904247-334b-4007-9577-97f917cfccec'
WHERE ledger_id = '92def401-5654-4698-a6e2-705cafa0aa2f';

-- 3. Update purchase_orders.ledger_id to use real ledger
UPDATE public.purchase_orders
SET ledger_id = '77904247-334b-4007-9577-97f917cfccec'
WHERE ledger_id = '92def401-5654-4698-a6e2-705cafa0aa2f';

-- 4. Delete the fake ledger
DELETE FROM public.ledgers
WHERE id = '92def401-5654-4698-a6e2-705cafa0aa2f';

-- Re-enable triggers
ALTER TABLE public.journal_voucher_lines ENABLE TRIGGER trg_recalculate_balance;
ALTER TABLE public.ledgers ENABLE TRIGGER trg_ledger_audit;
ALTER TABLE public.ledgers ENABLE TRIGGER trg_ledgers_updated;

-- 5. Add 'supplier' role to real medikab ledger if missing
INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary, priority)
SELECT '77904247-334b-4007-9577-97f917cfccec', company_id, 'supplier', false, 1
FROM public.ledgers
WHERE id = '77904247-334b-4007-9577-97f917cfccec'
  AND NOT EXISTS (
    SELECT 1 FROM public.ledger_roles 
    WHERE ledger_id = '77904247-334b-4007-9577-97f917cfccec' 
    AND role_type = 'supplier'
  );

-- 6. Force balance recalculation for real medikab ledger
-- This will correct any cached balance values
DELETE FROM public.ledger_balances 
WHERE ledger_id = '77904247-334b-4007-9577-97f917cfccec';

-- Re-insert correct balance by summing all journal lines.
-- Guarded in a DO block (not just a WHERE clause) because the aggregate
-- SELECT below returns exactly one row via COALESCE even when zero
-- journal_voucher_lines match — a bare WHERE can't stop that row from
-- being produced and failing the ledger_balances FK on a database where
-- this hardcoded ledger id never existed (e.g. a fresh install).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ledgers WHERE id = '77904247-334b-4007-9577-97f917cfccec') THEN
    INSERT INTO public.ledger_balances (
      ledger_id, company_id, financial_year, opening_balance, opening_balance_type,
      current_balance, total_debit, total_credit, closing_balance, closing_balance_type
    )
    SELECT
      '77904247-334b-4007-9577-97f917cfccec' as ledger_id,
      '1e98ddf2-6152-401b-8c12-da78cc41dd3f' as company_id,
      public.get_financial_year(CURRENT_DATE) as financial_year,
      0 as opening_balance,
      'debit'::public.balance_type as opening_balance_type,
      COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) as current_balance,
      COALESCE(SUM(debit_amount), 0) as total_debit,
      COALESCE(SUM(credit_amount), 0) as total_credit,
      COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) as closing_balance,
      CASE WHEN COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) >= 0
        THEN 'debit'::public.balance_type
        ELSE 'credit'::public.balance_type
      END as closing_balance_type
    FROM public.journal_voucher_lines
    WHERE ledger_id = '77904247-334b-4007-9577-97f917cfccec';
  END IF;
END $$;
