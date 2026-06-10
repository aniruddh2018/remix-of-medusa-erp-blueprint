-- ============================================================================
-- Expense Entry Support — Manual expense voucher creation
-- ============================================================================

-- Function to create an expense voucher
CREATE OR REPLACE FUNCTION public.create_expense_voucher(
  p_company_id UUID,
  p_date DATE,
  p_expense_ledger_id UUID,
  p_payment_ledger_id UUID,  -- Cash or Bank ledger
  p_amount NUMERIC,
  p_description TEXT,
  p_reference_number TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_voucher_id UUID;
  v_expense_name TEXT;
  v_payment_name TEXT;
BEGIN
  -- Get ledger names for narration
  SELECT name INTO v_expense_name FROM public.ledgers WHERE id = p_expense_ledger_id;
  SELECT name INTO v_payment_name FROM public.ledgers WHERE id = p_payment_ledger_id;

  -- Create voucher header
  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    p_company_id, COALESCE(p_date, CURRENT_DATE), 'expense', NULL,
    COALESCE(p_reference_number, 'EXP-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6)),
    COALESCE(p_description, 'Expense: ' || v_expense_name || ' paid via ' || v_payment_name),
    p_amount, p_created_by
  )
  RETURNING id INTO v_voucher_id;

  -- Debit: Expense Account
  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, p_expense_ledger_id, p_company_id, p_amount, 0, 
          COALESCE(p_description, v_expense_name || ' expense'));

  -- Credit: Cash/Bank Account
  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, p_payment_ledger_id, p_company_id, 0, p_amount, 
          'Payment for ' || v_expense_name);

  RETURN v_voucher_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.create_expense_voucher(UUID, DATE, UUID, UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

-- Function to get expense ledgers (all ledgers under Expenses group)
CREATE OR REPLACE FUNCTION public.get_expense_ledgers(p_company_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  group_name TEXT,
  current_balance NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.name,
    COALESCE(lg.name, 'Expenses')::TEXT as group_name,
    COALESCE(lb.current_balance, 0) as current_balance
  FROM public.ledgers l
  LEFT JOIN public.ledger_groups lg ON lg.id = l.ledger_group_id
  LEFT JOIN public.ledger_balances lb ON lb.ledger_id = l.id 
    AND lb.financial_year = public.get_financial_year(CURRENT_DATE)
  WHERE l.company_id = p_company_id
    AND l.is_active = true
    AND (
      lg.group_type = 'expenses' 
      OR EXISTS (
        SELECT 1 FROM public.ledger_roles lr 
        WHERE lr.ledger_id = l.id AND lr.role_type = 'expense'
      )
    )
  ORDER BY l.name;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_expense_ledgers(UUID) TO authenticated;
