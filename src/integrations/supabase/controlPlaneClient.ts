// ----------------------------------------------------------------------------
// Static client for the CONTROL PLANE Supabase project — the one project
// whose URL/anon key are still fixed at build time
// (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY), because the control
// plane's own address can't change without a redeploy anyway (it's the app
// entry point every browser talks to first).
//
// Used only for:
//   - resolving which tenant project a login belongs to, BEFORE any tenant
//     client exists (see TenantContext.resolveTenant, which calls the
//     resolve-tenant edge function through this client)
//   - the platform owner's own super-admin login (see AdminLogin.tsx),
//     which authenticates against the control plane, not a tenant project
//
// Deliberately a SEPARATE client instance (with its own storage key) from
// the dynamic `supabase` proxy in ./client.ts, so a super admin's
// control-plane session and a regular tenant user's session never collide
// in the same browser's localStorage — including the edge case where a
// client's "dedicated project" happens to literally be this same project
// (true for the pre-existing "Client #1" registered during the Phase 1
// rollout, see supabase/migrations/20260826120000_client_backends.sql).
// ----------------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

export const CONTROL_PLANE_URL = import.meta.env.VITE_SUPABASE_URL;
export const CONTROL_PLANE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const controlPlaneClient = createClient<Database>(CONTROL_PLANE_URL, CONTROL_PLANE_ANON_KEY, {
  auth: {
    storage: localStorage,
    storageKey: 'control-plane-auth-token',
    persistSession: true,
    autoRefreshToken: true,
  },
});
