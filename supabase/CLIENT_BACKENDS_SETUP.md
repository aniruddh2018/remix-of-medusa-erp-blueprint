# Client Backends: one-time cutover after deploying this feature

This app now supports a dedicated Supabase project per client (see
`supabase/migrations/20260826120000_client_backends.sql` and
`src/contexts/TenantContext.tsx`). Deploying this code changes how login
works: `/auth` now requires resolving an email to a registered
`client_backends` row *before* it will show a password field. **Until that
table has at least one row, no regular user can log in at `/auth`** — this
is expected, not a bug, and is fixed by the one-time step below.

The platform owner is not affected by this: `/admin-login` always talks to
the control-plane project directly and does not depend on `client_backends`
having any rows.

## One-time step: register the existing project as "Client #1"

The project this app has always run on (its existing real company/user data)
needs to be registered as a normal client backend, pointing at itself:

1. Deploy the migration and edge functions in this change (`client_backends`,
   `resolve-tenant`, `manage-client-backend`, `provision-client-backend`,
   `tenant-admin-provision`, `admin-tenant-login`, `sync-schema-migrations`).
2. Log in as the platform owner at `/admin-login` (this works immediately,
   independent of `client_backends`).
3. Go to Super Admin → Client Backends → Add Client Backend, and fill in:
   - **Project URL**: this project's own `VITE_SUPABASE_URL`
   - **Anon Key**: this project's own `VITE_SUPABASE_PUBLISHABLE_KEY`
   - **Service Role Key**: this project's service role key (Supabase
     dashboard → Project Settings → API)
   - **DB Connection String**: `postgresql://postgres:<SUPABASE_DB_PASSWORD>@db.<VITE_SUPABASE_PROJECT_ID>.supabase.co:5432/postgres`
     (or the pooler connection string from Project Settings → Database)
   - **Email Domain**: the email domain your existing users log in with
4. Click **Provision** on the new row. Since this project already has the
   full schema, every statement should apply as a no-op (the repo's
   migrations consistently use `IF NOT EXISTS`/`IF EXISTS` guards) — this
   just confirms `schema_migrations` matches what's actually there and marks
   the row `ready`, unblocking `resolve-tenant` for that email domain.
5. Regular users can now log in at `/auth` as before (email → automatically
   resolves to Client #1 → password).

Before step 4, run `npm run sync:schema` (with `SUPABASE_SERVICE_ROLE_KEY`
set) so the control plane's `schema_migrations` table actually has content
to provision from — see `scripts/sync-schema-migrations.mjs`.

## Onboarding every subsequent new client

From this point on, no code changes or redeploys are needed — the whole
flow lives in Super Admin → Client Backends:

1. Create a new, empty Supabase project for the client in the Supabase
   dashboard (this one manual step isn't automated yet — see the plan's
   "deferred" note about the Supabase Management API).
2. Add Client Backend with that project's URL/anon key/service role
   key/DB connection string.
3. Click Provision — applies the full schema (including per-company
   multi-tenancy, unchanged) to the new project.
4. Click "Create First Admin" to create that client's own admin login.
5. Give the client's admin their email/password — they log in at `/auth`
   like anyone else, and are routed straight to their own isolated project.
