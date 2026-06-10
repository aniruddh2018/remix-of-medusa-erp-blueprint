-- ============================================================================
-- Fix: Sales Voucher Trigger — Correctly handle credit vs cash sales
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

  -- Determine if this is a cash sale:
  -- Cash sale = payment is complete (paid AND amount_paid >= total)
  --            OR method is cash/upi/card AND status is paid (not credit!)
  -- Credit sale = payment_status = 'credit' OR partial payment
  v_is_cash := (NEW.payment_status = 'paid' AND COALESCE(NEW.amount_paid,0) >= NEW.total_amount)
    OR (NEW.payment_method IN ('cash','upi','card') 
        AND NEW.payment_status = 'paid');
  
  -- Explicitly NOT cash if:
  -- - payment_status = 'credit' (buy now, pay later)
  -- - payment_status = 'partial' (partial payment made)
  IF NEW.payment_status IN ('credit', 'partial') THEN
    v_is_cash := false;
  END IF;

  -- Resolve ledgers
  v_sales_account := public.get_or_create_system_ledger(NEW.company_id, 'Sales Account', 'Income', 'income');

  -- For credit sales, we need the customer ledger
  IF NOT v_is_cash THEN
    v_customer_ledger := public.resolve_party_ledger(NEW.company_id, NEW.customer_name, 'customer');
  ELSE
    -- For cash sales, still try to link to customer ledger for tracking
    v_customer_ledger := public.resolve_party_ledger(NEW.company_id, NEW.customer_name, 'customer');
    v_cash_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Cash', 'Cash-in-Hand', 'cash');
  END IF;

  -- Insert voucher
  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    NEW.company_id, COALESCE(NEW.sale_date, CURRENT_DATE), 'sales_order', NEW.id,
    COALESCE(NEW.invoice_number, 'Sale-' || NEW.id::TEXT),
    CASE 
      WHEN v_is_cash THEN 'Cash sale' 
      ELSE 'Credit sale - ' || COALESCE(NEW.customer_name, 'Unknown')
    END,
    NEW.total_amount, NEW.created_by
  )
  RETURNING id INTO v_voucher_id;

  -- Debit side
  IF v_is_cash THEN
    -- Cash sale: Debit Cash
    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, NEW.total_amount, 0, 'Cash / UPI / Card received');
    
    -- For cash sales, we DON'T debit the customer ledger (they already paid)
    -- But we DO link the sale to the customer for reporting via sales_orders.ledger_id
  ELSE
    -- Credit sale: Debit Customer (receivable)
    IF v_customer_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_customer_ledger, NEW.company_id, NEW.total_amount, 0, 
              'Receivable from ' || COALESCE(NEW.customer_name, 'customer'));
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
-- Fix: Regenerate journal entries for recent sales that may have wrong entries
-- This fixes existing data after the trigger logic change
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
  v_voucher_id UUID;
  v_sales_account UUID;
  v_customer_ledger UUID;
  v_should_be_cash BOOLEAN;
BEGIN
  -- Find sales where payment_status=credit but journal shows cash sale (wrong narration)
  FOR rec IN
    SELECT so.id, so.company_id, so.invoice_number, so.customer_name, so.total_amount,
           so.sale_date, so.created_by, so.ledger_id, so.payment_status,
           jv.id as voucher_id, jv.narration
    FROM public.sales_orders so
    JOIN public.journal_vouchers jv ON jv.reference_id = so.id AND jv.reference_type = 'sales_order'
    WHERE so.payment_status = 'credit'
      AND jv.narration = 'Cash sale'
    ORDER BY so.created_at DESC
    LIMIT 100
  LOOP
    -- This sale should be credit but was recorded as cash - fix it
    
    -- Delete wrong voucher lines
    DELETE FROM public.journal_voucher_lines WHERE voucher_id = rec.voucher_id;
    
    -- Get ledgers
    v_sales_account := public.get_or_create_system_ledger(rec.company_id, 'Sales Account', 'Income', 'income');
    v_customer_ledger := rec.ledger_id;
    
    IF v_customer_ledger IS NULL THEN
      v_customer_ledger := public.resolve_party_ledger(rec.company_id, rec.customer_name, 'customer');
    END IF;
    
    -- Update voucher narration
    UPDATE public.journal_vouchers 
    SET narration = 'Credit sale - ' || COALESCE(rec.customer_name, 'Unknown')
    WHERE id = rec.voucher_id;
    
    -- Create correct lines: Debit Customer, Credit Sales Account
    IF v_customer_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (rec.voucher_id, v_customer_ledger, rec.company_id, rec.total_amount, 0, 
              'Receivable from ' || COALESCE(rec.customer_name, 'customer'));
    END IF;
    
    INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
    VALUES (rec.voucher_id, v_sales_account, rec.company_id, 0, rec.total_amount, 'Sales income');
    
    -- Ensure ledger_id is set
    IF v_customer_ledger IS NOT NULL THEN
      UPDATE public.sales_orders SET ledger_id = v_customer_ledger WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- Also fix any cash sales that have wrong tracking entries (credit to customer instead of nothing)
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Find cash sales where customer ledger was credited (wrong tracking entry)
  FOR rec IN
    SELECT DISTINCT jvl.id as line_id, jvl.voucher_id
    FROM public.journal_voucher_lines jvl
    JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id
    WHERE jv.reference_type = 'sales_order'
      AND jv.narration = 'Cash sale'
      AND jvl.credit_amount > 0
      AND jvl.narration LIKE '%tracking%'
  LOOP
    -- Remove these wrong tracking entries
    DELETE FROM public.journal_voucher_lines WHERE id = rec.line_id;
  END LOOP;
END $$;
