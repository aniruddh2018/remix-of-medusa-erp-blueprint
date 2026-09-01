// ============================================================================
// resolve-tenant — PUBLIC, no auth required. This runs BEFORE login.
// ============================================================================
// Given a login email, looks up which client's dedicated Supabase project it
// belongs to (see supabase/migrations/20260826120000_client_backends.sql) and
// returns that project's URL + anon key, both safe to hand to the browser —
// the anon key is a public key by Supabase's own design, protected entirely
// by that project's own RLS. The frontend then dynamically instantiates a
// Supabase client for that project (see src/integrations/supabase/client.ts)
// and only then shows the password field.
//
// Deliberately returns the SAME generic error for "unknown email/domain" and
// "tenant inactive/not yet provisioned", so this endpoint can't be used to
// enumerate which client domains exist on the platform.
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GENERIC_ERROR = "We couldn't find your organization. Please check your email or contact your administrator.";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const domain = normalizedEmail.split("@")[1];

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // service_role bypasses RLS, which is exactly what's needed here since
    // client_backends grants no access at all to `authenticated`.
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Exact-email override (tenant_users) — for tenants whose users don't
    //    share one email domain (free-email admins, etc).
    let backendId: string | null = null;
    const { data: tenantUserRow } = await adminClient
      .from("tenant_users")
      .select("client_backend_id")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (tenantUserRow?.client_backend_id) {
      backendId = tenantUserRow.client_backend_id;
    }

    // 2. Fall back to email-domain match.
    if (!backendId && domain) {
      const { data: domainRow } = await adminClient
        .from("client_backends")
        .select("id")
        .eq("email_domain", domain)
        .eq("is_active", true)
        .maybeSingle();
      if (domainRow?.id) backendId = domainRow.id;
    }

    if (!backendId) {
      return new Response(
        JSON.stringify({ success: false, error: GENERIC_ERROR }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: backend, error: backendError } = await adminClient
      .from("client_backends")
      .select("name, slug, project_url, anon_key, is_active, provisioning_status")
      .eq("id", backendId)
      .maybeSingle();

    if (backendError || !backend || !backend.is_active || backend.provisioning_status !== "ready") {
      // Same generic message whether the tenant is unknown, inactive, or its
      // project hasn't finished being provisioned yet — no enumeration.
      return new Response(
        JSON.stringify({ success: false, error: GENERIC_ERROR }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        project_url: backend.project_url,
        anon_key: backend.anon_key,
        tenant_name: backend.name,
        tenant_slug: backend.slug,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[resolve-tenant] error:", error);
    return new Response(
      JSON.stringify({ success: false, error: GENERIC_ERROR }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
