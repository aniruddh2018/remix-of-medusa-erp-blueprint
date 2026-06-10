-- ============================================================================
-- CHUNK 3C: Party transactions, ledger merge, FK fixes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.post_sale_voucher()
RETURNS TRIGGER AS $$
DECLARE
  v_sales_account UUID;
  v_cash_ledger UUID;
  v_customer_ledger UUID;
  v_voucher_id UUID;
  v_fy TEXT;
  v_is_cash BOOLEAN;
BEGIN
  v_fy := public.get_financial_year(COALESCE(NEW.sale_date, CURRENT_DATE));

  v_is_cash := (NEW.payment_status = 'paid' AND COALESCE(NEW.amount_paid,0) >= NEW.total_amount)
    OR (NEW.payment_method IN ('cash','upi','card') AND (NEW.payment_status IS NULL OR NEW.payment_status = 'paid'));

  v_sales_account := public.get_or_create_system_ledger(NEW.company_id, 'Sales Account', 'Income', 'income');
  v_customer_ledger := public.resolve_party_ledger(NEW.company_id, NEW.customer_name, 'customer');

  IF v_is_cash THEN
    v_cash_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Cash', 'Cash-in-Hand', 'cash');
  END IF;

  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    NEW.company_id, COALESCE(NEW.sale_date, CURRENT_DATE), 'sales_order', NEW.id,
    COALESCE(NEW.invoice_number, 'Sale-' || NEW.id::TEXT),
    CASE WHEN v_is_cash THEN 'Cash sale' ELSE 'Credit sale - ' || COALESCE(NEW.customer_name, 'Unknown') END,
    NEW.total_amount, NEW.created_by
  )
  RETURNING id INTO v_voucher_id;

  IF v_is_cash THEN
    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, NEW.total_amount, 0, 'Cash / UPI / Card received');

    IF v_customer_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_customer_ledger, NEW.company_id, 0, NEW.total_amount, 'Cash sale to ' || COALESCE(NEW.customer_name, 'customer') || ' (tracking)');
    END IF;
  ELSE
    IF v_customer_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_customer_ledger, NEW.company_id, NEW.total_amount, 0, 'Receivable from ' || COALESCE(NEW.customer_name, 'customer'));
    END IF;
  END IF;

  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, v_sales_account, NEW.company_id, 0, NEW.total_amount, 'Sales income');

  IF v_customer_ledger IS NOT NULL THEN
    UPDATE public.sales_orders SET ledger_id = v_customer_ledger WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_sale_voucher ON public.sales_orders;
CREATE TRIGGER trg_post_sale_voucher
  AFTER INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.post_sale_voucher();

-- Party transaction history view
CREATE OR REPLACE VIEW public.party_transaction_history AS
SELECT
  l.id AS ledger_id,
  l.name AS party_name,
  jv.id AS voucher_id,
  jv.date,
  jv.reference_type AS ref_type,
  jv.reference_id,
  jv.reference_number AS ref_number,
  jv.narration,
  jvl.debit_amount AS debit,
  jvl.credit_amount AS credit,
  jv.created_at,
  l.current_balance AS ledger_current_balance
FROM public.journal_voucher_lines jvl
JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id
JOIN public.ledgers l ON l.id = jvl.ledger_id
WHERE jvl.ledger_id IN (SELECT DISTINCT ledger_id FROM public.ledger_roles);

GRANT SELECT ON public.party_transaction_history TO authenticated;

-- get_party_transactions RPC
CREATE OR REPLACE FUNCTION public.get_party_transactions(
  p_ledger_id UUID,
  p_year TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  date DATE,
  ref_type TEXT,
  ref_number TEXT,
  narration TEXT,
  debit NUMERIC,
  credit NUMERIC,
  running_balance NUMERIC,
  voucher_id UUID
) AS $$
DECLARE
  v_rb NUMERIC(18,4) := 0;
  v_opening NUMERIC(18,4);
  v_fy TEXT;
BEGIN
  v_fy := COALESCE(p_year, public.get_financial_year(CURRENT_DATE));

  SELECT COALESCE(opening_balance, 0) INTO v_opening
  FROM public.ledger_balances
  WHERE ledger_id = p_ledger_id AND financial_year = v_fy;

  v_rb := COALESCE(v_opening, 0);

  RETURN QUERY
  WITH lines AS (
    SELECT
      jv.date,
      jv.reference_type::TEXT AS reference_type,
      jv.reference_number,
      jvl.narration,
      jvl.debit_amount,
      jvl.credit_amount,
      jv.id AS vid,
      jv.created_at
    FROM public.journal_voucher_lines jvl
    JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id
    WHERE jvl.ledger_id = p_ledger_id
      AND public.get_financial_year(jv.date) = v_fy
      AND (jvl.narration IS NULL OR jvl.narration NOT LIKE '%(tracking)%')
    ORDER BY jv.date ASC, jv.created_at ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    l.date,
    l.reference_type,
    l.reference_number,
    l.narration,
    l.debit_amount,
    l.credit_amount,
    (v_rb + SUM(l.debit_amount - l.credit_amount) OVER (ORDER BY l.date ASC, l.vid ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)),
    l.vid
  FROM lines l
  ORDER BY l.date DESC, l.vid DESC;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_party_transactions(UUID, TEXT, INTEGER, INTEGER) TO authenticated;

-- Backfill: link existing sales to party ledgers
DO $$
DECLARE
  rec RECORD;
  v_ledger_id UUID;
BEGIN
  FOR rec IN
    SELECT so.id, so.company_id, so.customer_name
    FROM public.sales_orders so
    WHERE so.ledger_id IS NULL
      AND so.customer_name IS NOT NULL
      AND so.total_amount > 0
  LOOP
    SELECT l.id INTO v_ledger_id
    FROM public.ledgers l
    WHERE l.company_id = rec.company_id
      AND lower(l.name) = lower(trim(rec.customer_name))
    LIMIT 1;

    IF v_ledger_id IS NOT NULL THEN
      UPDATE public.sales_orders SET ledger_id = v_ledger_id WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- find_duplicate_ledgers
CREATE OR REPLACE FUNCTION public.find_duplicate_ledgers(p_company_id UUID)
RETURNS TABLE(
  canonical_name TEXT,
  duplicate_count BIGINT,
  ledger_ids UUID[],
  total_debit NUMERIC,
  total_credit NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH ledger_activity AS (
    SELECT
      l.id,
      lower(regexp_replace(l.name, '\s+(pvt\.?|ltd\.?|private|limited|llp|inc\.?).*$', '', 'i')) as normalized_name,
      COALESCE(SUM(jvl.debit_amount), 0) as debit,
      COALESCE(SUM(jvl.credit_amount), 0) as credit
    FROM public.ledgers l
    LEFT JOIN public.journal_voucher_lines jvl ON jvl.ledger_id = l.id
    WHERE l.company_id = p_company_id
    GROUP BY l.id, l.name
  )
  SELECT
    la.normalized_name,
    COUNT(*),
    array_agg(la.id),
    SUM(la.debit),
    SUM(la.credit)
  FROM ledger_activity la
  GROUP BY la.normalized_name
  HAVING COUNT(*) > 1
  ORDER BY SUM(la.debit + la.credit) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.find_duplicate_ledgers(UUID) TO authenticated;

-- merge_ledgers
CREATE OR REPLACE FUNCTION public.merge_ledgers(
  p_source_ledger_id UUID,
  p_target_ledger_id UUID,
  p_company_id UUID,
  p_merged_by UUID DEFAULT NULL
)
RETURNS TABLE(
  source_name TEXT,
  target_name TEXT,
  transactions_moved INTEGER,
  orders_updated INTEGER,
  payments_updated INTEGER,
  roles_merged INTEGER,
  balance_transferred NUMERIC
) AS $$
DECLARE
  v_source_name TEXT;
  v_target_name TEXT;
  v_transactions_moved INTEGER := 0;
  v_orders_updated INTEGER := 0;
  v_payments_updated INTEGER := 0;
  v_roles_merged INTEGER := 0;
  v_source_balance NUMERIC := 0;
  v_target_balance NUMERIC := 0;
  v_row_count INTEGER;
BEGIN
  IF p_source_ledger_id = p_target_ledger_id THEN
    RAISE EXCEPTION 'Source and target ledger cannot be the same';
  END IF;

  SELECT name INTO v_source_name FROM public.ledgers WHERE id = p_source_ledger_id AND company_id = p_company_id;
  SELECT name INTO v_target_name FROM public.ledgers WHERE id = p_target_ledger_id AND company_id = p_company_id;

  IF v_source_name IS NULL THEN RAISE EXCEPTION 'Source ledger not found'; END IF;
  IF v_target_name IS NULL THEN RAISE EXCEPTION 'Target ledger not found'; END IF;

  UPDATE public.journal_voucher_lines SET ledger_id = p_target_ledger_id
  WHERE ledger_id = p_source_ledger_id AND company_id = p_company_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_transactions_moved := v_row_count;

  UPDATE public.sales_orders SET ledger_id = p_target_ledger_id
  WHERE ledger_id = p_source_ledger_id AND company_id = p_company_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_orders_updated := v_orders_updated + v_row_count;

  UPDATE public.purchase_orders SET ledger_id = p_target_ledger_id
  WHERE ledger_id = p_source_ledger_id AND company_id = p_company_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_orders_updated := v_orders_updated + v_row_count;

  UPDATE public.payments SET ledger_id = p_target_ledger_id
  WHERE ledger_id = p_source_ledger_id AND company_id = p_company_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_payments_updated := v_row_count;

  INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary, priority)
  SELECT p_target_ledger_id, p_company_id, sr.role_type, false,
    (SELECT COALESCE(MAX(priority), 0) + 1 FROM public.ledger_roles WHERE ledger_id = p_target_ledger_id)
  FROM public.ledger_roles sr
  WHERE sr.ledger_id = p_source_ledger_id
    AND sr.company_id = p_company_id
    AND NOT EXISTS (
      SELECT 1 FROM public.ledger_roles tr
      WHERE tr.ledger_id = p_target_ledger_id AND tr.role_type = sr.role_type
    );
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_roles_merged := v_row_count;

  SELECT COALESCE(current_balance, 0) INTO v_source_balance FROM public.ledger_balances
  WHERE ledger_id = p_source_ledger_id AND financial_year = public.get_financial_year(CURRENT_DATE);

  SELECT COALESCE(current_balance, 0) INTO v_target_balance FROM public.ledger_balances
  WHERE ledger_id = p_target_ledger_id AND financial_year = public.get_financial_year(CURRENT_DATE);

  INSERT INTO public.ledger_audit_log (
    company_id, ledger_id, action, old_values, new_values, description, performed_by
  ) VALUES (
    p_company_id, p_target_ledger_id, 'merge',
    jsonb_build_object(
      'source_ledger_id', p_source_ledger_id, 'source_name', v_source_name,
      'source_balance', v_source_balance, 'target_ledger_id', p_target_ledger_id,
      'target_name', v_target_name, 'target_balance_before', v_target_balance
    ),
    jsonb_build_object(
      'target_ledger_id', p_target_ledger_id, 'transactions_moved', v_transactions_moved,
      'orders_updated', v_orders_updated, 'payments_updated', v_payments_updated,
      'roles_merged', v_roles_merged
    ),
    format('Merged ledger "%s" (ID: %s, balance: %s) into "%s" (ID: %s)',
      v_source_name, p_source_ledger_id, v_source_balance, v_target_name, p_target_ledger_id),
    p_merged_by
  );

  UPDATE public.ledgers
  SET is_active = false,
      name = v_source_name || ' [MERGED into ' || v_target_name || ']',
      updated_at = now()
  WHERE id = p_source_ledger_id AND company_id = p_company_id;

  RETURN QUERY SELECT v_source_name, v_target_name, v_transactions_moved,
    v_orders_updated, v_payments_updated, v_roles_merged, v_source_balance;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.merge_ledgers(UUID, UUID, UUID, UUID) TO authenticated;

-- bulk_merge_duplicate_ledgers
CREATE OR REPLACE FUNCTION public.bulk_merge_duplicate_ledgers(
  p_company_id UUID,
  p_merged_by UUID DEFAULT NULL,
  p_dry_run BOOLEAN DEFAULT true
)
RETURNS TABLE(
  canonical_name TEXT,
  kept_ledger_id UUID,
  kept_ledger_name TEXT,
  merged_ledger_id UUID,
  merged_ledger_name TEXT,
  transactions_moved INTEGER,
  orders_updated INTEGER,
  payments_updated INTEGER,
  status TEXT
) AS $$
DECLARE
  v_duplicate RECORD;
  v_canonical_ledger_id UUID;
  v_duplicate_ledger_id UUID;
  v_merge_result RECORD;
BEGIN
  FOR v_duplicate IN SELECT * FROM public.find_duplicate_ledgers(p_company_id)
  LOOP
    SELECT l.id INTO v_canonical_ledger_id
    FROM unnest(v_duplicate.ledger_ids) AS lid
    JOIN public.ledgers l ON l.id = lid
    LEFT JOIN public.ledger_roles lr ON lr.ledger_id = lid
    GROUP BY l.id
    ORDER BY
      COUNT(DISTINCT CASE WHEN lr.role_type IN ('customer','supplier') THEN lr.role_type END) DESC,
      (SELECT COUNT(*) FROM public.journal_voucher_lines jvl WHERE jvl.ledger_id = l.id) DESC
    LIMIT 1;

    FOR v_duplicate_ledger_id IN
      SELECT u FROM unnest(v_duplicate.ledger_ids) AS u WHERE u != v_canonical_ledger_id
    LOOP
      IF p_dry_run THEN
        RETURN QUERY SELECT
          v_duplicate.canonical_name, v_canonical_ledger_id,
          (SELECT name FROM public.ledgers WHERE id = v_canonical_ledger_id),
          v_duplicate_ledger_id,
          (SELECT name FROM public.ledgers WHERE id = v_duplicate_ledger_id),
          0::INTEGER, 0::INTEGER, 0::INTEGER, 'WOULD_MERGE'::TEXT;
      ELSE
        BEGIN
          SELECT * INTO v_merge_result FROM public.merge_ledgers(
            v_duplicate_ledger_id, v_canonical_ledger_id, p_company_id, p_merged_by
          );
          RETURN QUERY SELECT
            v_duplicate.canonical_name, v_canonical_ledger_id, v_merge_result.target_name,
            v_duplicate_ledger_id, v_merge_result.source_name,
            v_merge_result.transactions_moved, v_merge_result.orders_updated,
            v_merge_result.payments_updated, 'MERGED'::TEXT;
        EXCEPTION WHEN OTHERS THEN
          RETURN QUERY SELECT
            v_duplicate.canonical_name, v_canonical_ledger_id,
            (SELECT name FROM public.ledgers WHERE id = v_canonical_ledger_id),
            v_duplicate_ledger_id,
            (SELECT name FROM public.ledgers WHERE id = v_duplicate_ledger_id),
            0::INTEGER, 0::INTEGER, 0::INTEGER, ('ERROR: ' || SQLERRM)::TEXT;
        END;
      END IF;
    END LOOP;
  END LOOP;
  RETURN;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.bulk_merge_duplicate_ledgers(UUID, UUID, BOOLEAN) TO authenticated;

-- FK fixes for sales_orders.customer_id
ALTER TABLE public.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_customer_id_fkey;
ALTER TABLE public.sales_orders ALTER COLUMN customer_id DROP NOT NULL;
COMMENT ON COLUMN public.sales_orders.customer_id IS 'Legacy reference to customers table. New code should use ledger_id for the unified ledger system.';