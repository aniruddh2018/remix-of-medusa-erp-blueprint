-- 1) Views to SECURITY INVOKER
ALTER VIEW public.ledgers_with_roles SET (security_invoker = true);
ALTER VIEW public.ledger_transaction_history SET (security_invoker = true);
ALTER VIEW public.ledger_balances_with_names SET (security_invoker = true);
ALTER VIEW public.party_transaction_history SET (security_invoker = true);

-- 2) Lock search_path on user-defined functions
ALTER FUNCTION public.bulk_merge_duplicate_ledgers(uuid, uuid, boolean) SET search_path = public;
ALTER FUNCTION public.create_ledger_roles_from_staging(uuid, uuid, text[]) SET search_path = public;
ALTER FUNCTION public.execute_readonly_query(text, integer) SET search_path = public;
ALTER FUNCTION public.find_duplicate_ledgers(uuid) SET search_path = public;
ALTER FUNCTION public.flag_product_for_embedding() SET search_path = public;
ALTER FUNCTION public.get_financial_year(date) SET search_path = public;
ALTER FUNCTION public.get_ledger_group_ancestors(uuid) SET search_path = public;
ALTER FUNCTION public.get_ledger_group_descendants(uuid) SET search_path = public;
ALTER FUNCTION public.get_party_transactions(uuid, text, integer, integer) SET search_path = public;
ALTER FUNCTION public.get_user_company_id() SET search_path = public;
ALTER FUNCTION public.merge_ledgers(uuid, uuid, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.post_sale_voucher() SET search_path = public;
ALTER FUNCTION public.seed_default_ledger_groups(uuid) SET search_path = public;
ALTER FUNCTION public.update_ledger_group_path() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- 3) Revoke EXECUTE from PUBLIC/anon on SECURITY DEFINER functions; grant to authenticated + service_role
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public' AND d.objid IS NULL AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END$$;