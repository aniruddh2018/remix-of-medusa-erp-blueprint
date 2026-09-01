// ============================================================================
// sync-schema-migrations — super_admin (or trusted maintenance script) only.
// ============================================================================
// Edge functions can't read this repo's supabase/migrations/*.sql files at
// runtime (they aren't deployed alongside the function), so the control
// plane keeps a mirror of every migration's filename + contents in the
// `schema_migrations` table. provision-client-backend replays that table's
// rows, in filename order, against a newly registered client's project.
//
// This function is how that table gets populated/kept up to date:
//   - Run scripts/sync-schema-migrations.mjs (repo root) after adding any new
//     migration file — it reads supabase/migrations/*.sql locally and POSTs
//     them here using the service-role key (trusted maintenance path, since
//     a local script has that key from .env but not a logged-in super admin
//     session).
//   - Or invoke it from a logged-in super admin session (Authorization:
//     Bearer <user JWT>) if a "Sync Migrations" UI action is added later.
// Either path upserts by filename, so re-running is always safe.
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MigrationFile {
  filename: string;
  content: string;
}

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
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const bearerToken = authHeader.replace(/^Bearer\s+/i, "");
    const isTrustedMaintenanceCall = bearerToken === supabaseServiceKey;

    if (!isTrustedMaintenanceCall) {
      // Otherwise this must be a logged-in super admin session.
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(bearerToken);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", claimsData.claims.sub as string)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!roleData) {
        return new Response(
          JSON.stringify({ error: "Only super admins can sync schema migrations" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { files } = (await req.json()) as { files: MigrationFile[] };
    if (!Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ error: "files (non-empty array of {filename, content}) is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rows = files.map((f) => ({
      filename: f.filename,
      content: f.content,
      synced_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await adminClient
      .from("schema_migrations")
      .upsert(rows, { onConflict: "filename" });

    if (upsertError) {
      return new Response(
        JSON.stringify({ error: upsertError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, synced: rows.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[sync-schema-migrations] error:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
