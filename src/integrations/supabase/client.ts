// ----------------------------------------------------------------------------
// This file used to be a generated, build-time-only singleton pointed at one
// Supabase project. It's now hand-maintained because the app supports one
// dedicated Supabase project PER CLIENT (see supabase/migrations/
// 20260826120000_client_backends.sql and src/contexts/TenantContext.tsx):
// Vite bakes import.meta.env.VITE_* values in at build time, so a client's
// project URL/key can't come from there anymore — a new client has to be
// addable via the Super Admin UI without a rebuild/redeploy.
//
// Instead, `supabase` below is a lazily-bound Proxy: it forwards every call
// (`.from()`, `.rpc()`, `.auth`, `.functions.invoke()`, ...) to whichever
// real SupabaseClient is currently "active" for the resolved tenant. This is
// the mechanism that lets the ~100 existing files across the app that do
// `import { supabase } from "@/integrations/supabase/client"` keep working
// completely unchanged — only TenantContext calls setActiveTenantClient(),
// once it knows which project a login belongs to.
//
// IMPORTANT: code that reads `supabase.auth` to set up a subscription (e.g.
// `supabase.auth.onAuthStateChange`) captures whichever client is active AT
// THAT MOMENT — it will not follow a later tenant switch on its own. See the
// comment in src/contexts/AuthContext.tsx for how that's handled there.
// ----------------------------------------------------------------------------
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

let activeClient: SupabaseClient<Database> | null = null;
let activeTenantSlug: string | null = null;

export function setActiveTenantClient(
  url: string,
  anonKey: string,
  tenantSlug?: string
): SupabaseClient<Database> {
  activeClient = createClient<Database>(url, anonKey, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  activeTenantSlug = tenantSlug ?? null;
  return activeClient;
}

export function getActiveClient(): SupabaseClient<Database> | null {
  return activeClient;
}

export function getActiveTenantSlug(): string | null {
  return activeTenantSlug;
}

// A few call sites build edge-function URLs by hand (direct `fetch` instead
// of `supabase.functions.invoke`, or displaying a webhook URL for a
// third-party service like Twilio to call). Those must use the CURRENTLY
// ACTIVE tenant's project URL, not the build-time control-plane URL — using
// the wrong one would silently target another client's project. Use this
// helper instead of `import.meta.env.VITE_SUPABASE_URL` in any such spot.
export function getActiveProjectUrl(): string | null {
  return activeClient ? (activeClient as unknown as { supabaseUrl: string }).supabaseUrl : null;
}

export function clearActiveTenantClient() {
  activeClient = null;
  activeTenantSlug = null;
}

export const supabase: SupabaseClient<Database> = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, _receiver) {
    if (!activeClient) {
      throw new Error(
        "[supabase] No tenant backend is active yet. Code tried to use the Supabase " +
        "client before a tenant was resolved (see TenantContext.resolveTenant). Make " +
        "sure this call only runs once a session/tenant exists."
      );
    }
    const value = Reflect.get(activeClient, prop as keyof SupabaseClient<Database>);
    return typeof value === "function" ? value.bind(activeClient) : value;
  },
});
