-- ============================================================================
-- Client Backends (per-client dedicated Supabase project registry)
-- ============================================================================
-- This is the CONTROL PLANE side of "each client gets their own physically
-- isolated Supabase project". It sits ABOVE the existing company-level
-- multi-tenancy (companies / user_companies / company_id RLS), which stays
-- completely unchanged: one client's dedicated project can still contain
-- several companies, switched between via the existing CompanySwitcher.
--
-- Adds:
--   1. client_backends       — one row per client's dedicated Supabase
--                               project. Holds both safe-to-expose fields
--                               (project_url, anon_key) and secrets
--                               (service_role_key, db_connection_string).
--                               Same secrets pattern as
--                               gst_einvoice_credentials (20260820072511):
--                               RLS enabled, zero policies for
--                               `authenticated`, service_role only.
--   2. list_client_backends() — a SECURITY DEFINER function returning only
--                               the non-secret columns, gated by
--                               is_super_admin() internally, so the Super
--                               Admin UI never needs SELECT access to the
--                               base table (which would risk exposing
--                               service_role_key/db_connection_string via
--                               RLS-and-view edge cases).
--   3. tenant_users           — optional email -> client_backend lookup, for
--                               tenants whose users don't share one email
--                               domain.
--   4. provisioning_log       — audit trail of schema-provisioning runs
--                               against a client's dedicated project.
--   5. schema_migrations      — mirror of this repo's supabase/migrations/*
--                               contents, kept here because edge functions
--                               can't read the repo filesystem at runtime;
--                               provision-client-backend replays these
--                               against a newly registered project.
-- ============================================================================

-- ── 1. client_backends (secrets — service_role only) ───────────────────────
CREATE TABLE IF NOT EXISTS public.client_backends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  -- Safe to expose to an authenticated browser session that has already been
  -- resolved to this tenant: the anon key is a public key by Supabase design,
  -- protected entirely by that project's own RLS.
  project_url TEXT NOT NULL,
  anon_key TEXT NOT NULL,
  -- Secrets: never read outside an edge function running as service_role.
  service_role_key TEXT NOT NULL,
  db_connection_string TEXT NOT NULL,
  -- Used by resolve-tenant to map a login email to this client's project.
  email_domain TEXT,
  provisioning_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (provisioning_status IN ('pending', 'provisioning', 'ready', 'failed')),
  schema_version TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_backends_email_domain_idx ON public.client_backends(email_domain) WHERE email_domain IS NOT NULL;

-- Deliberately NO policies granted to `authenticated` at all — not even a
-- SELECT policy for super admins. This table holds service-role keys and
-- raw DB connection strings for every client's dedicated project, so RLS
-- denies all client access by default, same as gst_einvoice_credentials.
-- Only service_role (used exclusively inside the resolve-tenant /
-- provision-client-backend / tenant-admin-provision edge functions) can
-- read or write it directly. The Super Admin UI never queries this table —
-- it calls list_client_backends() below, which is the only path that can
-- return anything from it to an authenticated session, and it returns only
-- the non-secret columns.
ALTER TABLE public.client_backends ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.client_backends TO service_role;

CREATE TRIGGER trg_client_backends_updated_at
  BEFORE UPDATE ON public.client_backends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. list_client_backends() — non-secret columns, super-admin only ──────
-- SECURITY DEFINER so it can read client_backends despite the base table
-- having no `authenticated` policies; the function itself is the gate
-- (checks is_super_admin internally) and it only ever selects/returns the
-- safe columns, so there is no path for a secret column to leak through it
-- even if this function is later modified carelessly to `SELECT *`-adjacent
-- patterns — the RETURNS TABLE column list is the enforcement boundary.
CREATE OR REPLACE FUNCTION public.list_client_backends()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  project_url TEXT,
  email_domain TEXT,
  provisioning_status TEXT,
  schema_version TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name, slug, project_url, email_domain, provisioning_status,
         schema_version, is_active, created_at, updated_at
  FROM public.client_backends
  WHERE public.is_super_admin(auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.list_client_backends() TO authenticated;

-- ── 3. tenant_users (optional email -> client_backend lookup) ─────────────
CREATE TABLE IF NOT EXISTS public.tenant_users (
  email TEXT PRIMARY KEY,
  client_backend_id UUID NOT NULL REFERENCES public.client_backends(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.tenant_users TO service_role;
-- No `authenticated` policy: only resolve-tenant (service_role) and the
-- Super Admin "Add Client Backend" flow ever touch this table.

-- ── 4. provisioning_log (audit trail) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provisioning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_backend_id UUID NOT NULL REFERENCES public.client_backends(id) ON DELETE CASCADE,
  migration_file TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error TEXT,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provisioning_log_client_backend_idx ON public.provisioning_log(client_backend_id, ran_at DESC);

GRANT SELECT ON public.provisioning_log TO authenticated;
GRANT ALL ON public.provisioning_log TO service_role;
ALTER TABLE public.provisioning_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read provisioning_log"
  ON public.provisioning_log FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
-- No INSERT/UPDATE/DELETE policy for authenticated: only
-- provision-client-backend (service_role) writes rows here.

-- ── 5. schema_migrations (mirror of supabase/migrations/*.sql) ────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.schema_migrations TO service_role;
-- No `authenticated` policy: this holds the full DDL of the schema
-- (including this very file), only provision-client-backend needs it, and
-- only super admins trigger that indirectly via the UI action — never a
-- direct table read.
