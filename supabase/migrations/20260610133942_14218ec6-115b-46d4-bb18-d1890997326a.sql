
CREATE OR REPLACE FUNCTION public.backfill_company_ledger_entries(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_customers_created INT := 0;
  v_suppliers_created INT := 0;
  v_sales_posted INT := 0;
  v_purchases_posted INT := 0;
  v_payments_posted INT := 0;
  rec RECORD;
  v_voucher_id UUID;
  v_sales_account UUID;
  v_purchase_account UUID;
  v_cash_ledger UUID;
  v_bank_ledger UUID;
  v_party_ledger UUID;
  v_supplier_name TEXT;
  v_is_cash BOOLEAN;
  v_method TEXT;
  v_fy TEXT;
BEGIN
  -- Authz: must belong to the company (or be super admin)
  IF NOT (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND company_id = p_company_id
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized for this company';
  END IF;

  -- 1. CUSTOMERS → LEDGERS
  FOR rec IN
    SELECT c.* FROM public.customers c
    WHERE c.company_id = p_company_id
      AND NOT EXISTS (
        SELECT 1 FROM public.ledgers l
        WHERE l.company_id = p_company_id AND lower(l.name) = lower(c.name)
      )
  LOOP
    PERFORM public.resolve_party_ledger(p_company_id, rec.name, 'customer');
    v_customers_created := v_customers_created + 1;
  END LOOP;

  -- 2. SUPPLIERS → LEDGERS
  FOR rec IN
    SELECT s.* FROM public.suppliers s
    WHERE s.company_id = p_company_id
      AND NOT EXISTS (
        SELECT 1 FROM public.ledgers l
        WHERE l.company_id = p_company_id AND lower(l.name) = lower(s.name)
      )
  LOOP
    PERFORM public.resolve_party_ledger(p_company_id, rec.name, 'supplier');
    v_suppliers_created := v_suppliers_created + 1;
  END LOOP;

  -- 3. SALES → JOURNAL VOUCHERS (skip those already posted)
  FOR rec IN
    SELECT id, company_id, invoice_number, customer_name, total_amount, sale_date,
           payment_status, amount_paid, payment_method, created_by
    FROM public.sales_orders
    WHERE company_id = p_company_id AND total_amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_vouchers jv
        WHERE jv.company_id = p_company_id
          AND jv.reference_type = 'sales_order' AND jv.reference_id = sales_orders.id
      )
    ORDER BY created_at
  LOOP
    v_is_cash := (rec.payment_status = 'paid' AND COALESCE(rec.amount_paid,0) >= rec.total_amount)
      OR (rec.payment_method IN ('cash','upi','card') AND (rec.payment_status IS NULL OR rec.payment_status = 'paid'));

    v_sales_account := public.get_or_create_system_ledger(p_company_id, 'Sales Account', 'Income', 'income');

    INSERT INTO public.journal_vouchers (
      company_id, date, reference_type, reference_id, reference_number,
      narration, total_amount, created_by
    ) VALUES (
      p_company_id, COALESCE(rec.sale_date, CURRENT_DATE), 'sales_order', rec.id,
      COALESCE(rec.invoice_number, 'Sale-' || rec.id::TEXT),
      CASE WHEN v_is_cash THEN 'Cash sale (backfilled)' ELSE 'Credit sale (backfilled) - ' || COALESCE(rec.customer_name,'Unknown') END,
      rec.total_amount, rec.created_by
    ) RETURNING id INTO v_voucher_id;

    IF v_is_cash THEN
      v_cash_ledger := public.get_or_create_system_ledger(p_company_id, 'Cash', 'Cash-in-Hand', 'cash');
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_cash_ledger, p_company_id, rec.total_amount, 0, 'Cash received (backfilled)');
    ELSE
      v_party_ledger := public.resolve_party_ledger(p_company_id, rec.customer_name, 'customer');
      IF v_party_ledger IS NOT NULL THEN
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_party_ledger, p_company_id, rec.total_amount, 0, 'Receivable (backfilled)');
        UPDATE public.sales_orders SET ledger_id = v_party_ledger WHERE id = rec.id AND ledger_id IS NULL;
      END IF;
    END IF;

    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_sales_account, p_company_id, 0, rec.total_amount, 'Sales income (backfilled)');

    v_sales_posted := v_sales_posted + 1;
  END LOOP;

  -- 4. PURCHASES → JOURNAL VOUCHERS
  FOR rec IN
    SELECT po.id, po.company_id, po.order_number, po.invoice_number, po.supplier_id,
           po.total_amount, po.order_date, po.created_by
    FROM public.purchase_orders po
    WHERE po.company_id = p_company_id AND po.total_amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_vouchers jv
        WHERE jv.company_id = p_company_id
          AND jv.reference_type = 'purchase_order' AND jv.reference_id = po.id
      )
    ORDER BY po.created_at
  LOOP
    SELECT name INTO v_supplier_name FROM public.suppliers
    WHERE id = rec.supplier_id AND company_id = p_company_id;
    IF v_supplier_name IS NULL THEN
      v_supplier_name := 'Supplier ' || rec.supplier_id::TEXT;
    END IF;

    v_purchase_account := public.get_or_create_system_ledger(p_company_id, 'Purchase Account', 'Expenses', 'expense');
    v_party_ledger := public.resolve_party_ledger(p_company_id, v_supplier_name, 'supplier');

    INSERT INTO public.journal_vouchers (
      company_id, date, reference_type, reference_id, reference_number,
      narration, total_amount, created_by
    ) VALUES (
      p_company_id, COALESCE(rec.order_date, CURRENT_DATE), 'purchase_order', rec.id,
      COALESCE(rec.invoice_number, rec.order_number, 'PO-' || rec.id::TEXT),
      'Purchase from ' || v_supplier_name || ' (backfilled)',
      rec.total_amount, rec.created_by
    ) RETURNING id INTO v_voucher_id;

    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_purchase_account, p_company_id, rec.total_amount, 0, 'Purchase expense (backfilled)');

    IF v_party_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_party_ledger, p_company_id, 0, rec.total_amount, 'Payable (backfilled)');
      UPDATE public.purchase_orders SET ledger_id = v_party_ledger WHERE id = rec.id AND ledger_id IS NULL;
    END IF;

    v_purchases_posted := v_purchases_posted + 1;
  END LOOP;

  -- 5. PAYMENTS → JOURNAL VOUCHERS
  FOR rec IN
    SELECT id, company_id, payment_type, party_name, party_type, amount,
           payment_method, payment_date, reference_number, created_by
    FROM public.payments
    WHERE company_id = p_company_id AND amount > 0
      AND (skip_voucher_posting IS NULL OR skip_voucher_posting = false)
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_vouchers jv
        WHERE jv.company_id = p_company_id
          AND jv.reference_type = 'payment' AND jv.reference_id = payments.id
      )
    ORDER BY created_at
  LOOP
    v_method := COALESCE(rec.payment_method, 'cash');
    v_bank_ledger := NULL; v_cash_ledger := NULL;
    IF v_method IN ('bank_transfer','cheque') THEN
      v_bank_ledger := public.get_or_create_system_ledger(p_company_id, 'Bank Account', 'Bank Accounts', 'bank');
    ELSE
      v_cash_ledger := public.get_or_create_system_ledger(p_company_id, 'Cash', 'Cash-in-Hand', 'cash');
    END IF;

    v_party_ledger := public.resolve_party_ledger(p_company_id, rec.party_name,
      CASE WHEN rec.party_type = 'supplier' THEN 'supplier' ELSE 'customer' END);

    INSERT INTO public.journal_vouchers (
      company_id, date, reference_type, reference_id, reference_number,
      narration, total_amount, created_by
    ) VALUES (
      p_company_id, COALESCE(rec.payment_date, CURRENT_DATE), 'payment', rec.id,
      COALESCE(rec.reference_number, 'PAY-' || rec.id::TEXT),
      CASE WHEN rec.payment_type = 'received'
           THEN 'Payment received from ' || COALESCE(rec.party_name,'') || ' (backfilled)'
           ELSE 'Payment made to ' || COALESCE(rec.party_name,'') || ' (backfilled)' END,
      rec.amount, rec.created_by
    ) RETURNING id INTO v_voucher_id;

    IF rec.payment_type = 'received' THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, COALESCE(v_bank_ledger, v_cash_ledger), p_company_id, rec.amount, 0, 'Received via ' || v_method || ' (backfilled)');
      IF v_party_ledger IS NOT NULL THEN
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_party_ledger, p_company_id, 0, rec.amount, 'Customer receipt (backfilled)');
      END IF;
    ELSE
      IF v_party_ledger IS NOT NULL THEN
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_party_ledger, p_company_id, rec.amount, 0, 'Supplier payment (backfilled)');
      END IF;
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, COALESCE(v_bank_ledger, v_cash_ledger), p_company_id, 0, rec.amount, 'Paid via ' || v_method || ' (backfilled)');
    END IF;

    IF v_party_ledger IS NOT NULL THEN
      UPDATE public.payments SET ledger_id = v_party_ledger WHERE id = rec.id AND ledger_id IS NULL;
    END IF;

    v_payments_posted := v_payments_posted + 1;
  END LOOP;

  -- 6. Recalculate balances for current FY
  v_fy := public.get_financial_year(CURRENT_DATE);
  INSERT INTO public.ledger_balances (
    ledger_id, company_id, financial_year, opening_balance, opening_balance_type,
    current_balance, total_debit, total_credit, closing_balance, closing_balance_type
  )
  SELECT
    jvl.ledger_id, jvl.company_id, v_fy,
    COALESCE(lb.opening_balance, 0),
    COALESCE(lb.opening_balance_type, 'debit'::public.balance_type),
    COALESCE(lb.opening_balance, 0) + COALESCE(SUM(jvl.debit_amount),0) - COALESCE(SUM(jvl.credit_amount),0),
    COALESCE(SUM(jvl.debit_amount),0),
    COALESCE(SUM(jvl.credit_amount),0),
    COALESCE(lb.opening_balance, 0) + COALESCE(SUM(jvl.debit_amount),0) - COALESCE(SUM(jvl.credit_amount),0),
    CASE WHEN COALESCE(lb.opening_balance,0) + COALESCE(SUM(jvl.debit_amount),0) - COALESCE(SUM(jvl.credit_amount),0) >= 0
         THEN 'debit'::public.balance_type ELSE 'credit'::public.balance_type END
  FROM public.journal_voucher_lines jvl
  LEFT JOIN public.ledger_balances lb ON lb.ledger_id = jvl.ledger_id AND lb.financial_year = v_fy
  WHERE jvl.company_id = p_company_id
  GROUP BY jvl.ledger_id, jvl.company_id, lb.opening_balance, lb.opening_balance_type
  ON CONFLICT (ledger_id, financial_year) DO UPDATE SET
    current_balance = EXCLUDED.current_balance,
    total_debit = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    closing_balance = EXCLUDED.closing_balance,
    closing_balance_type = EXCLUDED.closing_balance_type,
    updated_at = now();

  RETURN jsonb_build_object(
    'customers_created', v_customers_created,
    'suppliers_created', v_suppliers_created,
    'sales_posted', v_sales_posted,
    'purchases_posted', v_purchases_posted,
    'payments_posted', v_payments_posted
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_company_ledger_entries(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_company_ledger_entries(UUID) TO authenticated, service_role;
