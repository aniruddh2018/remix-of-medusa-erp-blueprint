// ============================================================================
// admin-tenant-login — super_admin only. Support/impersonation access.
// ============================================================================
// Lets the platform owner get into a specific client's dedicated project for
// support purposes WITHOUT a parallel bypass API and WITHOUT ever seeing
// that project's service-role key in the browser. Reuses that tenant
// project's own RLS as-is: it ensures a dedicated, clearly-named support
// user exists in the TARGET tenant project (creating it on first use) with
// the 'admin' role, then issues a one-time magic link for that user and
// returns it to the caller.
//
// PREREQUISITE per tenant project: its Auth settings must allowlist this
// app's URL as a valid redirect for the magic link to complete sign-in —
// this is a manual, one-time setup step in that tenant's own Supabase
// dashboard (Authentication -> URL Configuration), not something this
// function can configure remotely.
//
// Every impersonation creates/reuses a real, auditable user row in the
// target project (visible in that project's own Super Admin "Users" list,
// named "Platform Support") rather than a hidden bypass, so tenant admins
// can see when platform support has accessed their data.
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPPORT_USER_EMAIL_PREFIX = "platform-support+";

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
    const callingUserEmail = (claimsData.claims.email as string | undefined) || callingUserId;

    const controlPlaneAdmin = createClient(controlPlaneUrl, controlPlaneServiceKey);

    const { data: roleData } = await controlPlaneAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callingUserId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Only super admins can use support access" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { client_backend_id, redirect_to } = await req.json();
    if (!client_backend_id) {
      return new Response(
        JSON.stringify({ error: "client_backend_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: backend, error: backendError } = await controlPlaneAdmin
      .from("client_backends")
      .select("id, name, project_url, service_role_key, provisioning_status")
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
        JSON.stringify({ error: "This client's project isn't ready yet" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantAdmin = createClient(backend.project_url, backend.service_role_key);

    // Support user is namespaced per super admin so access is attributable,
    // e.g. platform-support+<super-admin-user-id>@internal.invalid
    const supportEmail = `${SUPPORT_USER_EMAIL_PREFIX}${callingUserId}@internal.invalid`;

    // Ensure the support user exists in the TARGET tenant project.
    let supportUserId: string | null = null;
    const { data: existingUsers } = await tenantAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = existingUsers?.users?.find((u) => u.email === supportEmail);

    if (existing) {
      supportUserId = existing.id;
    } else {
      const { data: created, error: createError } = await tenantAdmin.auth.admin.createUser({
        email: supportEmail,
        email_confirm: true,
        user_metadata: { full_name: `Platform Support (${callingUserEmail})` },
      });
      if (createError || !created.user) {
        return new Response(
          JSON.stringify({ error: createError?.message || "Failed to provision support access" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      supportUserId = created.user.id;
      await tenantAdmin.from("user_roles").update({ role: "admin" }).eq("user_id", supportUserId);
    }

    const { data: linkData, error: linkError } = await tenantAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: supportEmail,
      options: redirect_to ? { redirectTo: redirect_to } : undefined,
    });

    if (linkError || !linkData) {
      return new Response(
        JSON.stringify({ error: linkError?.message || "Failed to generate support login link" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[admin-tenant-login] AUDIT: super admin ${callingUserEmail} (${callingUserId}) generated support access to client_backend ${client_backend_id} (${backend.name})`
    );

    return new Response(
      JSON.stringify({
        success: true,
        action_link: linkData.properties?.action_link,
        project_url: backend.project_url,
        tenant_name: backend.name,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[admin-tenant-login] error:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
