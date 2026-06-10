-- ============================================================================
-- Ledger Merge Function — Consolidates duplicate party ledgers
-- ============================================================================

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
  -- Validate inputs
  IF p_source_ledger_id = p_target_ledger_id THEN
    RAISE EXCEPTION 'Source and target ledger cannot be the same';
  END IF;

  -- Get ledger names for logging
  SELECT name INTO v_source_name FROM public.ledgers WHERE id = p_source_ledger_id AND company_id = p_company_id;
  SELECT name INTO v_target_name FROM public.ledgers WHERE id = p_target_ledger_id AND company_id = p_company_id;
  
  IF v_source_name IS NULL THEN
    RAISE EXCEPTION 'Source ledger not found or does not belong to company';
  END IF;
  IF v_target_name IS NULL THEN
    RAISE EXCEPTION 'Target ledger not found or does not belong to company';
  END IF;

  -- 1. Move journal voucher lines (update ledger_id from source to target)
  UPDATE public.journal_voucher_lines
  SET ledger_id = p_target_ledger_id
  WHERE ledger_id = p_source_ledger_id
    AND company_id = p_company_id;
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_transactions_moved := v_row_count;

  -- 2. Update sales_orders to point to target ledger
  UPDATE public.sales_orders
  SET ledger_id = p_target_ledger_id
  WHERE ledger_id = p_source_ledger_id
    AND company_id = p_company_id;
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_orders_updated := v_orders_updated + v_row_count;

  -- 3. Update purchase_orders
  UPDATE public.purchase_orders
  SET ledger_id = p_target_ledger_id
  WHERE ledger_id = p_source_ledger_id
    AND company_id = p_company_id;
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_orders_updated := v_orders_updated + v_row_count;

  -- 4. Update payments
  UPDATE public.payments
  SET ledger_id = p_target_ledger_id
  WHERE ledger_id = p_source_ledger_id
    AND company_id = p_company_id;
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_payments_updated := v_row_count;

  -- 5. Merge roles — add any roles from source that target doesn't have
  INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary, priority)
  SELECT 
    p_target_ledger_id,
    p_company_id,
    sr.role_type,
    false, -- Not primary for merged roles
    (SELECT COALESCE(MAX(priority), 0) + 1 FROM public.ledger_roles WHERE ledger_id = p_target_ledger_id)
  FROM public.ledger_roles sr
  WHERE sr.ledger_id = p_source_ledger_id
    AND sr.company_id = p_company_id
    AND NOT EXISTS (
      SELECT 1 FROM public.ledger_roles tr
      WHERE tr.ledger_id = p_target_ledger_id
        AND tr.role_type = sr.role_type
    );
  
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_roles_merged := v_row_count;

  -- 6. Get balance info for logging
  SELECT COALESCE(current_balance, 0) INTO v_source_balance
  FROM public.ledger_balances
  WHERE ledger_id = p_source_ledger_id
    AND financial_year = public.get_financial_year(CURRENT_DATE);
  
  SELECT COALESCE(current_balance, 0) INTO v_target_balance
  FROM public.ledger_balances
  WHERE ledger_id = p_target_ledger_id
    AND financial_year = public.get_financial_year(CURRENT_DATE);

  -- 7. Log to audit
  INSERT INTO public.ledger_audit_log (
    company_id,
    ledger_id,
    action,
    old_values,
    new_values,
    description,
    performed_by
  ) VALUES (
    p_company_id,
    p_target_ledger_id,
    'merge',
    jsonb_build_object(
      'source_ledger_id', p_source_ledger_id,
      'source_name', v_source_name,
      'source_balance', v_source_balance,
      'target_ledger_id', p_target_ledger_id,
      'target_name', v_target_name,
      'target_balance_before', v_target_balance
    ),
    jsonb_build_object(
      'target_ledger_id', p_target_ledger_id,
      'transactions_moved', v_transactions_moved,
      'orders_updated', v_orders_updated,
      'payments_updated', v_payments_updated,
      'roles_merged', v_roles_merged
    ),
    format('Merged ledger "%s" (ID: %s, balance: %s) into "%s" (ID: %s)', 
           v_source_name, p_source_ledger_id, v_source_balance,
           v_target_name, p_target_ledger_id),
    p_merged_by
  );

  -- 8. Deactivate source ledger (don't delete — preserve history)
  UPDATE public.ledgers
  SET 
    is_active = false,
    name = v_source_name || ' [MERGED into ' || v_target_name || ']', -- Rename to indicate merge
    updated_at = now()
  WHERE id = p_source_ledger_id
    AND company_id = p_company_id;

  -- Return summary
  RETURN QUERY SELECT 
    v_source_name,
    v_target_name,
    v_transactions_moved,
    v_orders_updated,
    v_payments_updated,
    v_roles_merged,
    v_source_balance;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.merge_ledgers(UUID, UUID, UUID, UUID) TO authenticated;

-- ============================================================================
-- Bulk Merge Duplicates Function
-- Uses find_duplicate_ledgers to merge all duplicates automatically
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_merge_duplicate_ledgers(
  p_company_id UUID,
  p_merged_by UUID DEFAULT NULL,
  p_dry_run BOOLEAN DEFAULT true -- If true, only returns what WOULD be merged
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
  v_row_count INTEGER;
BEGIN
  -- Iterate through all duplicates found by find_duplicate_ledgers
  FOR v_duplicate IN
    SELECT * FROM public.find_duplicate_ledgers(p_company_id)
  LOOP
    -- Pick the "canonical" ledger (first in array, or the one with most roles, or most activity)
    -- Strategy: Pick the one with both customer+supplier roles, or most transactions
    
    SELECT l.id INTO v_canonical_ledger_id
    FROM unnest(v_duplicate.ledger_ids) AS lid
    JOIN public.ledgers l ON l.id = lid
    LEFT JOIN public.ledger_roles lr ON lr.ledger_id = lid
    GROUP BY l.id
    ORDER BY 
      -- Prioritize ledgers with both customer and supplier roles
      COUNT(DISTINCT CASE WHEN lr.role_type IN ('customer', 'supplier') THEN lr.role_type END) DESC,
      -- Then by total transaction volume
      (SELECT COUNT(*) FROM public.journal_voucher_lines jvl WHERE jvl.ledger_id = lid) DESC
    LIMIT 1;

    -- Merge all others into the canonical
    FOR v_duplicate_ledger_id IN
      SELECT unnest(v_duplicate.ledger_ids)
      WHERE unnest(v_duplicate.ledger_ids) != v_canonical_ledger_id
    LOOP
      IF p_dry_run THEN
        -- Just return what would happen
        RETURN QUERY SELECT
          v_duplicate.canonical_name,
          v_canonical_ledger_id,
          (SELECT name FROM public.ledgers WHERE id = v_canonical_ledger_id),
          v_duplicate_ledger_id,
          (SELECT name FROM public.ledgers WHERE id = v_duplicate_ledger_id),
          0::INTEGER, -- transactions
          0::INTEGER, -- orders
          0::INTEGER, -- payments
          'WOULD_MERGE'::TEXT;
      ELSE
        -- Actually perform the merge
        BEGIN
          SELECT * INTO v_merge_result
          FROM public.merge_ledgers(
            v_duplicate_ledger_id,
            v_canonical_ledger_id,
            p_company_id,
            p_merged_by
          );
          
          RETURN QUERY SELECT
            v_duplicate.canonical_name,
            v_canonical_ledger_id,
            v_merge_result.target_name,
            v_duplicate_ledger_id,
            v_merge_result.source_name,
            v_merge_result.transactions_moved,
            v_merge_result.orders_updated,
            v_merge_result.payments_updated,
            'MERGED'::TEXT;
            
        EXCEPTION WHEN OTHERS THEN
          RETURN QUERY SELECT
            v_duplicate.canonical_name,
            v_canonical_ledger_id,
            (SELECT name FROM public.ledgers WHERE id = v_canonical_ledger_id),
            v_duplicate_ledger_id,
            (SELECT name FROM public.ledgers WHERE id = v_duplicate_ledger_id),
            0::INTEGER,
            0::INTEGER,
            0::INTEGER,
            'ERROR: ' || SQLERRM::TEXT;
        END;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.bulk_merge_duplicate_ledgers(UUID, UUID, BOOLEAN) TO authenticated;
