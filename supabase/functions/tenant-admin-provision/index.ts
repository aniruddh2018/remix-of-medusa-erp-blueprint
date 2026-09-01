// ============================================================================
// tenant-admin-provision — super_admin only.
// ============================================================================
// After a client's dedicated project has been provisioned (schema applied
// via provision-client-backend), this creates that client's FIRST admin
// user — inside the TENANT's own project, using that project's own
// service-role key (looked up from client_backends in the control plane),
// not the control plane's. Mirrors the existing create-user edge function's
// shape, just pointed at a different project's Postgres/Auth.
//
// Also registers the new admin's email in the control plane's tenant_users
// table so resolve-tenant finds them even if their email domain doesn't
// match client_backends.email_domain exactly (e.g. a personal email).
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const controlPlaneUrl = Deno.env.get("SUPABASE_URL")!;
    const controlPlaneAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const controlPlaneServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(controlPlaneUrl, controlPlaneAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const callingUserId = claimsData.claims.sub as string;

    const controlPlaneAdmin = createClient(controlPlaneUrl, controlPlaneServiceKey);

    const { data: roleData } = await controlPlaneAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callingUserId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Only super admins can provision a tenant's first admin" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { client_backend_id, email, password, fullName } = await req.json();
    if (!client_backend_id || !email || !password || !fullName) {
      return new Response(
        JSON.stringify({ error: "client_backend_id, email, password, and fullName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: backend, error: backendError } = await controlPlaneAdmin
      .from("client_backends")
      .select("id, project_url, service_role_key, provisioning_status")
      .eq("id", client_backend_id)
      .maybeSingle();

    if (backendError || !backend) {
      return new Response(
        JSON.stringify({ error: "Client backend not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (backend.provisioning_status !== "ready") {
      return new Response(
        JSON.stringify({ error: "This client's project hasn't finished schema provisioning yet" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin client for the TARGET tenant project — not the control plane.
    const tenantAdmin = createClient(backend.project_url, backend.service_role_key);

    const { data: newUser, error: createError } = await tenantAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !newUser.user) {
      return new Response(
        JSON.stringify({ error: createError?.message || "Failed to create tenant admin user" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The tenant project's own handle_new_user trigger creates a profile row;
    // promote this first user to 'admin' (the tenant's own user_roles table).
    const { error: roleUpdateError } = await tenantAdmin
      .from("user_roles")
      .update({ role: "admin" })
      .eq("user_id", newUser.user.id);
    if (roleUpdateError) {
      console.log("[tenant-admin-provision] role update warning:", roleUpdateError.message);
    }

    const { error: profileUpdateError } = await tenantAdmin
      .from("profiles")
      .update({ full_name: fullName })
      .eq("user_id", newUser.user.id);
    if (profileUpdateError) {
      console.log("[tenant-admin-provision] profile update warning:", profileUpdateError.message);
    }

    // So resolve-tenant finds this exact login even without a domain match.
    const { error: tenantUserError } = await controlPlaneAdmin
      .from("tenant_users")
      .upsert({ email: email.trim().toLowerCase(), client_backend_id }, { onConflict: "email" });
    if (tenantUserError) {
      console.log("[tenant-admin-provision] tenant_users upsert warning:", tenantUserError.message);
    }

    return new Response(
      JSON.stringify({ success: true, user: { id: newUser.user.id, email: newUser.user.email } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[tenant-admin-provision] error:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
