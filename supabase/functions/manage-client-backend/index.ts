// ============================================================================
// manage-client-backend — super_admin only.
// ============================================================================
// client_backends holds secrets (service_role_key, db_connection_string) and
// deliberately has NO policies granted to `authenticated` at all — not even
// for super admins — so the Super Admin "Client Backends" UI can't write to
// it directly (see supabase/migrations/20260826120000_client_backends.sql).
// This function is the only path that creates/updates/deletes rows there;
// it verifies the caller is a super admin, then writes via the service role.
// Reads go through the separate list_client_backends() SQL function instead
// (safe: it only returns non-secret columns), not this function.
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
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

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callingUserId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Only super admins can manage client backends" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, id, fields } = await req.json();

    if (action === "create") {
      const required = ["name", "slug", "project_url", "anon_key", "service_role_key", "db_connection_string"];
      const missing = required.filter((k) => !fields?.[k]);
      if (missing.length > 0) {
        return new Response(
          JSON.stringify({ error: `Missing required field(s): ${missing.join(", ")}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await adminClient
        .from("client_backends")
        .insert({
          name: fields.name,
          slug: fields.slug,
          project_url: fields.project_url,
          anon_key: fields.anon_key,
          service_role_key: fields.service_role_key,
          db_connection_string: fields.db_connection_string,
          email_domain: fields.email_domain || null,
        })
        .select("id")
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, id: data.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "update") {
      if (!id) {
        return new Response(
          JSON.stringify({ error: "id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const allowed = [
        "name",
        "slug",
        "project_url",
        "anon_key",
        "service_role_key",
        "db_connection_string",
        "email_domain",
        "is_active",
      ];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (fields && key in fields) updates[key] = fields[key];
      }
      if (Object.keys(updates).length === 0) {
        return new Response(
          JSON.stringify({ error: "No updatable fields provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await adminClient.from("client_backends").update(updates).eq("id", id);
      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete") {
      if (!id) {
        return new Response(
          JSON.stringify({ error: "id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Deletes the registry row only — the client's actual dedicated
      // Supabase project (and its data) is untouched; this just removes it
      // from resolve-tenant's lookup so no one can log into it via this app.
      const { error } = await adminClient.from("client_backends").delete().eq("id", id);
      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'create', 'update', or 'delete'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[manage-client-backend] error:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
