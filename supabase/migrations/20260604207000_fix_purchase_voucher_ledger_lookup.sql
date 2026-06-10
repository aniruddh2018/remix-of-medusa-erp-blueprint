-- ============================================================================
-- Fix: post_purchase_voucher trigger — supplier_id is now ledger_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.post_purchase_voucher()
RETURNS TRIGGER AS $$
DECLARE
  v_purchase_account UUID;
  v_supplier_ledger UUID;
  v_cash_ledger UUID;
  v_bank_ledger UUID;
  v_voucher_id UUID;
  v_supplier_name TEXT;
  v_is_cash BOOLEAN;
  v_method TEXT;
BEGIN
  -- supplier_id is now the ledger_id (unified ledger system)
  -- Look up the supplier name from ledgers table
  SELECT name INTO v_supplier_name
  FROM public.ledgers
  WHERE id = NEW.supplier_id AND company_id = NEW.company_id;

  IF v_supplier_name IS NULL THEN
    v_supplier_name := 'Supplier ' || NEW.supplier_id::TEXT;
  END IF;

  -- supplier_id IS the ledger_id now
  v_supplier_ledger := NEW.supplier_id;

  -- Determine if this is a cash purchase
  v_method := COALESCE(NEW.payment_method, 'credit');
  v_is_cash := (NEW.payment_status = 'paid' AND COALESCE(NEW.amount_paid, 0) >= NEW.total_amount)
    OR (v_method IN ('cash', 'upi', 'card') AND NEW.payment_status = 'paid');

  v_purchase_account := public.get_or_create_system_ledger(NEW.company_id, 'Purchase Account', 'Expenses', 'expense');

  -- Resolve cash/bank ledger for cash purchases
  IF v_is_cash THEN
    IF v_method IN ('bank_transfer', 'cheque') THEN
      v_bank_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Bank Account', 'Bank Accounts', 'bank');
    ELSE
      v_cash_ledger := public.get_or_create_system_ledger(NEW.company_id, 'Cash', 'Cash-in-Hand', 'cash');
    END IF;
  END IF;

  INSERT INTO public.journal_vouchers (
    company_id, date, reference_type, reference_id, reference_number,
    narration, total_amount, created_by
  ) VALUES (
    NEW.company_id, COALESCE(NEW.order_date, CURRENT_DATE), 'purchase_order', NEW.id,
    COALESCE(NEW.invoice_number, NEW.order_number, 'PO-' || NEW.id::TEXT),
    CASE WHEN v_is_cash 
      THEN 'Cash purchase from ' || v_supplier_name 
      ELSE 'Purchase from ' || v_supplier_name 
    END,
    NEW.total_amount, NEW.created_by
  )
  RETURNING id INTO v_voucher_id;

  -- Debit: Purchase Account (always)
  INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
  VALUES (v_voucher_id, v_purchase_account, NEW.company_id, NEW.total_amount, 0, 
          CASE WHEN v_is_cash THEN 'Cash purchase expense' ELSE 'Purchase expense' END);

  -- Credit side
  IF v_is_cash THEN
    -- Cash purchase: Credit Cash or Bank
    IF v_bank_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_bank_ledger, NEW.company_id, 0, NEW.total_amount, 'Paid via bank/' || v_method);
    ELSE
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_cash_ledger, NEW.company_id, 0, NEW.total_amount, 'Paid via ' || v_method);
    END IF;
    
    -- For cash purchases, we don't credit supplier (they were paid immediately)
    -- But we still link the order to supplier ledger for tracking/reporting
    IF v_supplier_ledger IS NOT NULL THEN
      UPDATE public.purchase_orders SET ledger_id = v_supplier_ledger WHERE id = NEW.id;
    END IF;
  ELSE
    -- Credit purchase: Credit Supplier (payable)
    IF v_supplier_ledger IS NOT NULL THEN
      INSERT INTO public.journal_voucher_lines (voucher_id, ledger_id, company_id, debit_amount, credit_amount, narration)
      VALUES (v_voucher_id, v_supplier_ledger, NEW.company_id, 0, NEW.total_amount, 'Payable to ' || v_supplier_name);
      UPDATE public.purchase_orders SET ledger_id = v_supplier_ledger WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_post_purchase_voucher ON public.purchase_orders;
CREATE TRIGGER trg_post_purchase_voucher
  AFTER INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.post_purchase_voucher();
