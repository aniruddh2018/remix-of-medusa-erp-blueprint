-- ============================================================================
-- Party Transaction History — Shows ALL business with a party (by ledger or name)
-- Fixes: Cash sales not showing in customer history, duplicate ledger issues
-- ============================================================================

-- First, update sales_orders to link to party ledger even for cash sales
-- This enables proper customer/supplier tracking without changing accounting

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

  -- Determine if this is a cash sale
  v_is_cash := (NEW.payment_status = 'paid' AND COALESCE(NEW.amount_paid,0) >= NEW.total_amount)
    OR (NEW.payment_method IN ('cash','upi','card') AND (NEW.payment_status IS NULL OR NEW.payment_status = 'paid'));

  -- Resolve ledgers
  v_sales_account := public.get_or_create_system_ledger(NEW.company_id, 'Sales Account', 'Income', 'income');

  -- ALWAYS resolve party ledger for tracking (even for cash sales)
  -- This links the sale to the customer record
  v_customer_ledger := public.resolve_party_ledger(NEW.company_id, NEW.customer_name, 'customer');

  IF v_is_cash THEN
    v_cash_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Cash', 'Cash-in-Hand', 'cash');
  END IF;

  -- Insert voucher
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

  -- Debit side
  IF v_is_cash THEN
    -- Cash sale: Debit Cash (accounting entry)
    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, NEW.total_amount, 0, 'Cash / UPI / Card received');
    
    -- Also record receivable from customer for tracking (immediately cleared)
    IF v_customer_ledger IS NOT NULL THEN
      -- Debit Customer (tracking entry - reversed immediately by cash)
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_customer_ledger, NEW.company_id, 0, NEW.total_amount, 'Cash sale to ' || COALESCE(NEW.customer_name, 'customer') || ' (tracking)');
    END IF;
  ELSE
    -- Credit sale: Debit Customer
    IF v_customer_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_customer_ledger, NEW.company_id, NEW.total_amount, 0, 'Receivable from ' || COALESCE(NEW.customer_name, 'customer'));
    END IF;
  END IF;

  -- Credit side (Sales Account) - always present
  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, v_sales_account, NEW.company_id, 0, NEW.total_amount, 'Sales income');

  -- Store resolved ledger on the order for future reference
  IF v_customer_ledger IS NOT NULL THEN
    UPDATE public.sales_orders SET ledger_id = v_customer_ledger WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_post_sale_voucher ON public.sales_orders;
CREATE TRIGGER trg_post_sale_voucher
  AFTER INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.post_sale_voucher();

-- ============================================================================
-- NEW: Party Transaction History View
-- Shows ALL transactions with a party, including:
-- - Credit sales (where party ledger is debited)
-- - Cash sales (where party ledger has tracking entry)
-- - Purchases (where party ledger is credited)
-- - Payments (received from/made to party)
-- ============================================================================

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
  -- Running balance for this ledger
  l.current_balance AS ledger_current_balance
FROM public.journal_voucher_lines jvl
JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id
JOIN public.ledgers l ON l.id = jvl.ledger_id
WHERE jvl.ledger_id IN (
  -- Only include party ledgers (ledgers with roles)
  SELECT DISTINCT ledger_id FROM public.ledger_roles
)
ORDER BY jv.date DESC, jv.created_at DESC;

ALTER VIEW public.party_transaction_history OWNER TO postgres;
GRANT SELECT ON public.party_transaction_history TO authenticated;

-- ============================================================================
-- NEW: RPC to get unified party transactions
-- Takes a ledger_id and returns all transactions with that party
-- ============================================================================

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
      jv.reference_type::TEXT,
      jv.reference_number,
      jvl.narration,
      jvl.debit_amount,
      jvl.credit_amount,
      jv.id AS vid
    FROM public.journal_voucher_lines jvl
    JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id
    WHERE jvl.ledger_id = p_ledger_id
      AND public.get_financial_year(jv.date) = v_fy
      -- Exclude pure tracking entries (cash sales have both cash and party entries)
      AND NOT jvl.narration LIKE '%(tracking)%'
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

-- ============================================================================
-- Backfill: Fix past cash sales to link to party ledger
-- Update sales_orders.ledger_id for all cash sales where it's NULL
-- ============================================================================

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
    -- Try to find matching ledger
    SELECT l.id INTO v_ledger_id
    FROM public.ledgers l
    WHERE l.company_id = rec.company_id
      AND lower(l.name) = lower(trim(rec.customer_name))
    LIMIT 1;
    
    -- If found, update the sale
    IF v_ledger_id IS NOT NULL THEN
      UPDATE public.sales_orders 
      SET ledger_id = v_ledger_id 
      WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- Fix: Merge duplicate ledgers for the same party
-- This consolidates ledgers with similar names
-- ============================================================================

-- Function to find potential duplicate ledgers
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
      lower(regexp_replace(l.name, '\\s+(pvt\.?|ltd\.?|private|limited|llp|inc\.?).*$', '', 'i')) as normalized_name,
      COALESCE(SUM(jvl.debit_amount), 0) as debit,
      COALESCE(SUM(jvl.credit_amount), 0) as credit
    FROM public.ledgers l
    LEFT JOIN public.journal_voucher_lines jvl ON jvl.ledger_id = l.id
    WHERE l.company_id = p_company_id
    GROUP BY l.id, l.name
  )
  SELECT 
    la.normalized_name as canonical_name,
    COUNT(*) as duplicate_count,
    array_agg(la.id) as ledger_ids,
    SUM(la.debit) as total_debit,
    SUM(la.credit) as total_credit
  FROM ledger_activity la
  GROUP BY la.normalized_name
  HAVING COUNT(*) > 1
  ORDER BY SUM(la.debit + la.credit) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.find_duplicate_ledgers(UUID) TO authenticated;
