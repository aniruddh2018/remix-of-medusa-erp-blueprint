-- ============================================================================
-- Hotfix: Fix NULL current_balance in recalculate_ledger_balance trigger
-- Issue: v_opening is NULL when no previous balance exists (no rows returned)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_ledger_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_ledger_id UUID;
  v_company_id UUID;
  v_fy TEXT;
  v_total_debit NUMERIC(18,4) := 0;
  v_total_credit NUMERIC(18,4) := 0;
  v_opening NUMERIC(18,4) := 0;
  v_current NUMERIC(18,4);
  v_balance_found BOOLEAN := false;
BEGIN
  -- Determine affected ledger
  IF TG_OP = 'DELETE' THEN
    v_ledger_id := OLD.ledger_id;
    v_company_id := OLD.company_id;
  ELSE
    v_ledger_id := NEW.ledger_id;
    v_company_id := NEW.company_id;
  END IF;

  -- Use current date for FY; all balances run in the current FY for real-time updates.
  v_fy := public.get_financial_year(CURRENT_DATE);

  -- Get totals from journal lines
  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_total_debit, v_total_credit
  FROM public.journal_voucher_lines
  WHERE ledger_id = v_ledger_id;

  -- Get opening balance for this FY (if exists)
  SELECT opening_balance INTO v_opening
  FROM public.ledger_balances
  WHERE ledger_id = v_ledger_id AND financial_year = v_fy;
  
  -- If no row found, set opening to 0
  IF NOT FOUND THEN
    v_opening := 0;
  END IF;

  -- Calculate current balance
  v_current := COALESCE(v_opening, 0) + v_total_debit - v_total_credit;

  INSERT INTO public.ledger_balances (
    ledger_id, company_id, financial_year, opening_balance, opening_balance_type,
    current_balance, total_debit, total_credit, closing_balance, closing_balance_type
  ) VALUES (
    v_ledger_id, v_company_id, v_fy,
    COALESCE(v_opening, 0), 'debit'::public.balance_type,
    v_current, v_total_debit, v_total_credit,
    v_current,
    CASE WHEN v_current >= 0 THEN 'debit'::public.balance_type ELSE 'credit'::public.balance_type END
  )
  ON CONFLICT (ledger_id, financial_year) DO UPDATE SET
    current_balance = EXCLUDED.current_balance,
    total_debit = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    closing_balance = EXCLUDED.closing_balance,
    closing_balance_type = EXCLUDED.closing_balance_type,
    updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
