-- Update ledger_balances_with_names view to include contact fields
-- This enables Sales/Purchase pages to use ledgers instead of legacy tables

DROP VIEW IF EXISTS public.ledger_balances_with_names;

CREATE VIEW public.ledger_balances_with_names AS
SELECT
  l.id,
  l.company_id,
  l.name,
  l.alias,
  l.ledger_code,
  l.opening_balance,
  l.balance_type,
  l.phone,
  l.email,
  l.address,
  l.gst_number,
  l.is_active,
  l.created_at,
  l.updated_at,
  lb.financial_year,
  lb.current_balance,
  lb.total_debit,
  lb.total_credit,
  lb.closing_balance,
  lb.closing_balance_type,
  COALESCE(array_agg(DISTINCT lr.role_type::text) FILTER (WHERE lr.role_type IS NOT NULL), ARRAY[]::text[]) AS roles,
  lg.name AS group_name,
  lg.group_type
FROM public.ledgers l
LEFT JOIN public.ledger_balances lb ON lb.ledger_id = l.id
LEFT JOIN public.ledger_roles lr ON lr.ledger_id = l.id
LEFT JOIN public.ledger_groups lg ON lg.id = l.ledger_group_id
GROUP BY l.id, lb.financial_year, lb.current_balance, lb.total_debit, lb.total_credit, lb.closing_balance, lb.closing_balance_type, lg.name, lg.group_type;

ALTER VIEW public.ledger_balances_with_names OWNER TO postgres;
GRANT SELECT ON public.ledger_balances_with_names TO authenticated;
GRANT SELECT ON public.ledger_balances_with_names TO anon;
