-- ============================================================================
-- Backfill Journal Vouchers from Historical Sales / Purchases / Payments
-- Phase 2.2: One-time migration to populate ledger_balances with real data
-- ============================================================================

SET search_path = public, extensions;

-- Fix: recreate helper functions using TEXT instead of enum types
-- (enum types may not be in the search_path during migration execution)

CREATE OR REPLACE FUNCTION public.get_or_create_system_ledger(
  p_company_id UUID,
  p_ledger_name TEXT,
  p_group_name TEXT,
  p_role_type TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_group_id UUID;
  v_ledger_id UUID;
BEGIN
  SET LOCAL search_path = 'public', 'extensions';
  SELECT id INTO v_group_id
  FROM public.ledger_groups
  WHERE company_id = p_company_id AND name = p_group_name AND is_system = true
  LIMIT 1;

  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id
    FROM public.ledger_groups
    WHERE company_id = p_company_id AND name = p_group_name
    LIMIT 1;
  END IF;

  IF v_group_id IS NULL THEN
    INSERT INTO public.ledger_groups (company_id, name, group_type, is_system, sort_order)
    VALUES (p_company_id, p_group_name, 'other', true, 99)
    RETURNING id INTO v_group_id;
  END IF;

  SELECT id INTO v_ledger_id
  FROM public.ledgers
  WHERE company_id = p_company_id AND name = p_ledger_name
  LIMIT 1;

  IF v_ledger_id IS NULL THEN
    INSERT INTO public.ledgers (
      company_id, ledger_group_id, name, opening_balance, balance_type,
      is_active, source_system
    ) VALUES (
      p_company_id, v_group_id, p_ledger_name, 0, 'debit', true, 'imported'
    )
    RETURNING id INTO v_ledger_id;
  END IF;

  IF p_role_type IS NOT NULL AND p_role_type IN (
    'customer','supplier','manufacturer','distributor',
    'employee','doctor','bank','tax','expense','income','asset','liability'
  ) THEN
    INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
    VALUES (v_ledger_id, p_company_id, p_role_type::public.ledger_role_type, false)
    ON CONFLICT (ledger_id, role_type) DO NOTHING;
  END IF;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql SET search_path = 'public', 'extensions';

CREATE OR REPLACE FUNCTION public.resolve_party_ledger(
  p_company_id UUID,
  p_party_name TEXT,
  p_party_type TEXT
)
RETURNS UUID AS $$
DECLARE
  v_ledger_id UUID;
  v_group_name TEXT;
  v_role TEXT;
  v_group_type TEXT;
BEGIN
  SET LOCAL search_path = 'public', 'extensions';
  IF p_party_name IS NULL OR trim(p_party_name) = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_ledger_id
  FROM public.ledgers
  WHERE company_id = p_company_id
    AND lower(name) = lower(trim(p_party_name))
  LIMIT 1;

  IF v_ledger_id IS NOT NULL THEN
    RETURN v_ledger_id;
  END IF;

  IF p_party_type = 'supplier' THEN
    v_group_name := 'Sundry Creditors';
    v_role := 'supplier';
    v_group_type := 'sundry_creditors';
  ELSE
    v_group_name := 'Sundry Debtors';
    v_role := 'customer';
    v_group_type := 'sundry_debtors';
  END IF;

  INSERT INTO public.ledgers (
    company_id, name, opening_balance, balance_type, is_active, source_system
  ) VALUES (
    p_company_id, trim(p_party_name), 0, 'debit', true, 'imported'
  )
  RETURNING id INTO v_ledger_id;

  DECLARE
    v_group_id UUID;
  BEGIN
    SELECT id INTO v_group_id FROM public.ledger_groups
    WHERE company_id = p_company_id AND name = v_group_name AND is_system = true
    LIMIT 1;
    IF v_group_id IS NULL THEN
      INSERT INTO public.ledger_groups (company_id, name, group_type, is_system, sort_order)
      VALUES (p_company_id, v_group_name, v_group_type, true, 99)
      RETURNING id INTO v_group_id;
    END IF;
    UPDATE public.ledgers SET ledger_group_id = v_group_id WHERE id = v_ledger_id;
  END;

  IF v_role IN ('customer','supplier','manufacturer','distributor',
    'employee','doctor','bank','tax','expense','income','asset','liability') THEN
    INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
    VALUES (v_ledger_id, p_company_id, v_role::public.ledger_role_type, true)
    ON CONFLICT (ledger_id, role_type) DO NOTHING;
  END IF;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql;

-- Fix: log_ledger_audit() has a bug with alias — recreate before backfill
CREATE OR REPLACE FUNCTION public.log_ledger_audit()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_changed TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    INSERT INTO public.ledger_audit_log (company_id, ledger_id, action, new_values, description)
    VALUES (NEW.company_id, NEW.id, v_action, to_jsonb(NEW), 'Ledger created: ' || NEW.name);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    SELECT array_agg(diff.key) INTO v_changed
    FROM (
      SELECT r.key FROM jsonb_each(to_jsonb(NEW)) AS r(key, value)
      EXCEPT
      SELECT r.key FROM jsonb_each(to_jsonb(OLD)) AS r(key, value)
    ) diff;
    IF v_changed IS NOT NULL AND array_length(v_changed, 1) > 0 THEN
      INSERT INTO public.ledger_audit_log (company_id, ledger_id, action, old_values, new_values, changed_fields, description)
      VALUES (NEW.company_id, NEW.id, v_action, to_jsonb(OLD), to_jsonb(NEW), v_changed,
        'Updated ' || array_to_string(v_changed, ', ') || ' on ' || NEW.name);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    INSERT INTO public.ledger_audit_log (company_id, ledger_id, action, old_values, description)
    VALUES (OLD.company_id, OLD.id, v_action, to_jsonb(OLD), 'Ledger deleted: ' || OLD.name);
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Disable balance trigger during bulk backfill to avoid per-row slowness
ALTER TABLE public.journal_voucher_lines DISABLE TRIGGER trg_recalculate_balance;

-- Temporarily disable auto-post triggers so this script doesn't loop
ALTER TABLE public.sales_orders DISABLE TRIGGER trg_post_sale_voucher;
ALTER TABLE public.purchase_orders DISABLE TRIGGER trg_post_purchase_voucher;
ALTER TABLE public.payments DISABLE TRIGGER trg_post_payment_voucher;

-- ─── 1. BACKFILL SALES ────────────────────────────────────────────────────

DO $$
DECLARE
  rec RECORD;
  v_voucher_id UUID;
  v_sales_account UUID;
  v_cash_ledger UUID;
  v_customer_ledger UUID;
  v_is_cash BOOLEAN;
BEGIN
  FOR rec IN
    SELECT id, company_id, invoice_number, customer_name, total_amount, sale_date,
           payment_status, amount_paid, payment_method, created_by
    FROM public.sales_orders
    WHERE total_amount > 0
    ORDER BY created_at
  LOOP
    v_is_cash := (rec.payment_status = 'paid' AND COALESCE(rec.amount_paid,0) >= rec.total_amount)
      OR (rec.payment_method IN ('cash','upi','card') AND (rec.payment_status IS NULL OR rec.payment_status = 'paid'));

    v_sales_account := public.get_or_create_system_ledger(rec.company_id, 'Sales Account', 'Income', 'income');

    INSERT INTO public.journal_vouchers (
      company_id, date, reference_type, reference_id, reference_number,
      narration, total_amount, created_by
    ) VALUES (
      rec.company_id, COALESCE(rec.sale_date, CURRENT_DATE), 'sales_order', rec.id,
      COALESCE(rec.invoice_number, 'Sale-' || rec.id::TEXT),
      CASE WHEN v_is_cash THEN 'Cash sale (backfilled)' ELSE 'Credit sale (backfilled) - ' || COALESCE(rec.customer_name, 'Unknown') END,
      rec.total_amount, rec.created_by
    )
    RETURNING id INTO v_voucher_id;

    -- Debit side
    IF v_is_cash THEN
      v_cash_ledger := public.get_or_create_system_ledger(rec.company_id, 'Cash', 'Cash-in-Hand', 'cash');
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_cash_ledger, rec.company_id, rec.total_amount, 0, 'Cash / UPI / Card received (backfilled)');
    ELSE
      v_customer_ledger := public.resolve_party_ledger(rec.company_id, rec.customer_name, 'customer');
      IF v_customer_ledger IS NOT NULL THEN
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_customer_ledger, rec.company_id, rec.total_amount, 0, 'Receivable from ' || COALESCE(rec.customer_name, 'customer') || ' (backfilled)');
        UPDATE public.sales_orders SET ledger_id = v_customer_ledger WHERE id = rec.id;
      END IF;
    END IF;

    -- Credit side
    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_sales_account, rec.company_id, 0, rec.total_amount, 'Sales income (backfilled)');
  END LOOP;
END $$;

-- ─── 2. BACKFILL PURCHASES ────────────────────────────────────────────────

DO $$
DECLARE
  rec RECORD;
  v_voucher_id UUID;
  v_purchase_account UUID;
  v_supplier_ledger UUID;
  v_supplier_name TEXT;
BEGIN
  FOR rec IN
    SELECT po.id, po.company_id, po.order_number, po.invoice_number, po.supplier_id,
           po.total_amount, po.order_date, po.created_by
    FROM public.purchase_orders po
    WHERE po.total_amount > 0
    ORDER BY po.created_at
  LOOP
    SELECT name INTO v_supplier_name
    FROM public.suppliers
    WHERE id = rec.supplier_id AND company_id = rec.company_id;

    IF v_supplier_name IS NULL THEN
      v_supplier_name := 'Supplier ' || rec.supplier_id::TEXT;
    END IF;

    v_purchase_account := public.get_or_create_system_ledger(rec.company_id, 'Purchase Account', 'Expenses', 'expense');
    v_supplier_ledger := public.resolve_party_ledger(rec.company_id, v_supplier_name, 'supplier');

    INSERT INTO public.journal_vouchers (
      company_id, date, reference_type, reference_id, reference_number,
      narration, total_amount, created_by
    ) VALUES (
      rec.company_id, COALESCE(rec.order_date, CURRENT_DATE), 'purchase_order', rec.id,
      COALESCE(rec.invoice_number, rec.order_number, 'PO-' || rec.id::TEXT),
      'Purchase from ' || v_supplier_name || ' (backfilled)',
      rec.total_amount, rec.created_by
    )
    RETURNING id INTO v_voucher_id;

    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_purchase_account, rec.company_id, rec.total_amount, 0, 'Purchase expense (backfilled)');

    IF v_supplier_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_supplier_ledger, rec.company_id, 0, rec.total_amount, 'Payable to ' || v_supplier_name || ' (backfilled)');
      UPDATE public.purchase_orders SET ledger_id = v_supplier_ledger WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- ─── 3. BACKFILL PAYMENTS ─────────────────────────────────────────────────

DO $$
DECLARE
  rec RECORD;
  v_voucher_id UUID;
  v_cash_ledger UUID;
  v_bank_ledger UUID;
  v_party_ledger UUID;
  v_method TEXT;
BEGIN
  FOR rec IN
    SELECT id, company_id, payment_type, reference_type, reference_id, reference_number,
           party_name, party_type, amount, payment_method, payment_date, created_by,
           skip_voucher_posting
    FROM public.payments
    WHERE amount > 0 AND (skip_voucher_posting IS NULL OR skip_voucher_posting = false)
    ORDER BY created_at
  LOOP
    v_method := COALESCE(rec.payment_method, 'cash');

    IF v_method IN ('bank_transfer', 'cheque') THEN
      v_bank_ledger := public.get_or_create_system_ledger(rec.company_id, 'Bank Account', 'Bank Accounts', 'bank');
    ELSE
      v_cash_ledger := public.get_or_create_system_ledger(rec.company_id, 'Cash', 'Cash-in-Hand', 'cash');
    END IF;

    IF rec.party_type = 'supplier' THEN
      v_party_ledger := public.resolve_party_ledger(rec.company_id, rec.party_name, 'supplier');
    ELSE
      v_party_ledger := public.resolve_party_ledger(rec.company_id, rec.party_name, 'customer');
    END IF;

    INSERT INTO public.journal_vouchers (
      company_id, date, reference_type, reference_id, reference_number,
      narration, total_amount, created_by
    ) VALUES (
      rec.company_id, COALESCE(rec.payment_date, CURRENT_DATE), 'payment', rec.id,
      COALESCE(rec.reference_number, 'PAY-' || rec.id::TEXT),
      CASE WHEN rec.payment_type = 'received' THEN 'Payment received from ' || COALESCE(rec.party_name, '') || ' (backfilled)'
           ELSE 'Payment made to ' || COALESCE(rec.party_name, '') || ' (backfilled)' END,
      rec.amount, rec.created_by
    )
    RETURNING id INTO v_voucher_id;

    IF rec.payment_type = 'received' THEN
      IF v_bank_ledger IS NOT NULL THEN
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_bank_ledger, rec.company_id, rec.amount, 0, 'Received via ' || v_method || ' (backfilled)');
      ELSE
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_cash_ledger, rec.company_id, rec.amount, 0, 'Received via ' || v_method || ' (backfilled)');
      END IF;
      IF v_party_ledger IS NOT NULL THEN
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_party_ledger, rec.company_id, 0, rec.amount, 'Customer receipt (backfilled)');
      END IF;
    ELSE
      IF v_party_ledger IS NOT NULL THEN
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_party_ledger, rec.company_id, rec.amount, 0, 'Supplier payment (backfilled)');
      END IF;
      IF v_bank_ledger IS NOT NULL THEN
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_bank_ledger, rec.company_id, 0, rec.amount, 'Paid via ' || v_method || ' (backfilled)');
      ELSE
        INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
        VALUES (v_voucher_id, v_cash_ledger, rec.company_id, 0, rec.amount, 'Paid via ' || v_method || ' (backfilled)');
      END IF;
    END IF;

    IF v_party_ledger IS NOT NULL THEN
      UPDATE public.payments SET ledger_id = v_party_ledger WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- ─── 4. BATCH RECALCULATE ALL BALANCES ───────────────────────────────────

DO $$
DECLARE
  v_fy TEXT := public.get_financial_year(CURRENT_DATE);
BEGIN
  INSERT INTO public.ledger_balances (
    ledger_id, company_id, financial_year, opening_balance, opening_balance_type,
    current_balance, total_debit, total_credit, closing_balance, closing_balance_type
  )
  SELECT
    jvl.ledger_id,
    jvl.company_id,
    v_fy,
    COALESCE(lb.opening_balance, 0),
    COALESCE(lb.opening_balance_type, 'debit'::public.balance_type),
    COALESCE(lb.opening_balance, 0) + COALESCE(SUM(jvl.debit_amount), 0) - COALESCE(SUM(jvl.credit_amount), 0),
    COALESCE(SUM(jvl.debit_amount), 0),
    COALESCE(SUM(jvl.credit_amount), 0),
    COALESCE(lb.opening_balance, 0) + COALESCE(SUM(jvl.debit_amount), 0) - COALESCE(SUM(jvl.credit_amount), 0),
    CASE WHEN COALESCE(lb.opening_balance, 0) + COALESCE(SUM(jvl.debit_amount), 0) - COALESCE(SUM(jvl.credit_amount), 0) >= 0 THEN 'debit'::public.balance_type ELSE 'credit'::public.balance_type END
  FROM public.journal_voucher_lines jvl
  LEFT JOIN public.ledger_balances lb ON lb.ledger_id = jvl.ledger_id AND lb.financial_year = v_fy
  GROUP BY jvl.ledger_id, jvl.company_id, lb.opening_balance, lb.opening_balance_type
  ON CONFLICT (ledger_id, financial_year) DO UPDATE SET
    current_balance = EXCLUDED.current_balance,
    total_debit = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    closing_balance = EXCLUDED.closing_balance,
    closing_balance_type = EXCLUDED.closing_balance_type,
    updated_at = now();
END $$;

-- Re-enable triggers
ALTER TABLE public.journal_voucher_lines ENABLE TRIGGER trg_recalculate_balance;
ALTER TABLE public.sales_orders ENABLE TRIGGER trg_post_sale_voucher;
ALTER TABLE public.purchase_orders ENABLE TRIGGER trg_post_purchase_voucher;
ALTER TABLE public.payments ENABLE TRIGGER trg_post_payment_voucher;
