-- Hotfix: Fix resolve_party_ledger to add missing roles to existing ledgers
-- Issue: When a ledger exists (e.g., as customer) but is used in a different
-- context (e.g., as supplier), the role wasn't being added.

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
  IF p_party_name IS NULL OR trim(p_party_name) = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_ledger_id
  FROM public.ledgers
  WHERE company_id = p_company_id
    AND lower(name) = lower(trim(p_party_name))
  LIMIT 1;

  -- Determine the role for this party type
  IF p_party_type = 'supplier' THEN
    v_group_name := 'Sundry Creditors';
    v_role := 'supplier';
    v_group_type := 'sundry_creditors';
  ELSE
    v_group_name := 'Sundry Debtors';
    v_role := 'customer';
    v_group_type := 'sundry_debtors';
  END IF;

  -- If ledger exists, ensure the role is assigned
  IF v_ledger_id IS NOT NULL THEN
    IF v_role IN ('customer','supplier','manufacturer','distributor',
      'employee','doctor','bank','tax','expense','income','asset','liability') THEN
      INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
      VALUES (v_ledger_id, p_company_id, v_role::public.ledger_role_type, false)
      ON CONFLICT (ledger_id, role_type) DO NOTHING;
    END IF;
    RETURN v_ledger_id;
  END IF;

  -- Create new ledger
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

-- Also fix the version in the backfill migration context (it's the same function signature)
-- This ensures both definitions are consistent

-- Fix any existing dual-role ledgers that may be missing roles
-- Find ledgers with journal entries but missing corresponding roles

INSERT INTO public.ledger_roles (ledger_id, company_id, role_type, is_primary)
SELECT DISTINCT
  jvl.ledger_id,
  jv.company_id,
  CASE 
    WHEN jv.reference_type = 'sales_order' THEN 'customer'::public.ledger_role_type
    WHEN jv.reference_type = 'purchase_order' THEN 'supplier'::public.ledger_role_type
    ELSE 'customer'::public.ledger_role_type
  END,
  false
FROM public.journal_voucher_lines jvl
JOIN public.journal_vouchers jv ON jv.id = jvl.voucher_id
LEFT JOIN public.ledger_roles lr ON lr.ledger_id = jvl.ledger_id 
  AND lr.role_type = CASE 
    WHEN jv.reference_type = 'sales_order' THEN 'customer'::public.ledger_role_type
    WHEN jv.reference_type = 'purchase_order' THEN 'supplier'::public.ledger_role_type
    ELSE 'customer'::public.ledger_role_type
  END
WHERE lr.id IS NULL
  AND jv.reference_type IN ('sales_order', 'purchase_order')
ON CONFLICT (ledger_id, role_type) DO NOTHING;
