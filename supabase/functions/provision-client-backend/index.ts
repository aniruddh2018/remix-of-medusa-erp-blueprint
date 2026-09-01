// ============================================================================
// provision-client-backend — super_admin only.
// ============================================================================
// Takes a client_backends row that the owner has just registered via the
// Super Admin "Client Backends" tab (its project_url/anon_key/
// service_role_key/db_connection_string already saved by that point — see
// supabase/migrations/20260826120000_client_backends.sql) and applies the
// FULL app schema to that project's own Postgres database, so a brand new
// client project ends up with the exact same tables/RLS/functions as every
// other tenant — including the existing company-level multi-tenancy
// (companies / user_companies / RLS-by-company_id), which is untouched by
// any of this and ships to every tenant project as-is.
//
// The schema itself is read from the `schema_migrations` table (kept in
// sync with supabase/migrations/*.sql by scripts/sync-schema-migrations.mjs
// + the sync-schema-migrations function), because this function cannot read
// the repo's filesystem at runtime. Each file is applied in filename order
// inside its own try/catch so a partial failure is visible per-file in
// provisioning_log rather than as one opaque error.
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client as PgClient } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

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
        JSON.stringify({ error: "Only super admins can provision client backends" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { client_backend_id } = await req.json();
    if (!client_backend_id) {
      return new Response(
        JSON.stringify({ error: "client_backend_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: backend, error: backendError } = await adminClient
      .from("client_backends")
      .select("id, name, db_connection_string, provisioning_status")
      .eq("id", client_backend_id)
      .maybeSingle();

    if (backendError || !backend) {
      return new Response(
        JSON.stringify({ error: "Client backend not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (backend.provisioning_status === "provisioning") {
      return new Response(
        JSON.stringify({ error: "This client backend is already being provisioned" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: migrations, error: migrationsError } = await adminClient
      .from("schema_migrations")
      .select("filename, content")
      .order("filename", { ascending: true });

    if (migrationsError || !migrations || migrations.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            "No schema migrations are synced yet. Run scripts/sync-schema-migrations.mjs first so this control plane has the schema to apply.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await adminClient
      .from("client_backends")
      .update({ provisioning_status: "provisioning" })
      .eq("id", client_backend_id);

    let pg: PgClient | null = null;
    let failedAt: string | null = null;

    try {
      pg = new PgClient(backend.db_connection_string);
      await pg.connect();

      for (const migration of migrations) {
        try {
          // Simple-query protocol (no bind parameters) handles a file with
          // multiple `;`-separated DDL statements in one call.
          await pg.queryArray(migration.content);
          await adminClient.from("provisioning_log").insert({
            client_backend_id,
            migration_file: migration.filename,
            status: "success",
          });
        } catch (fileErr: unknown) {
          const message = fileErr instanceof Error ? fileErr.message : String(fileErr);
          await adminClient.from("provisioning_log").insert({
            client_backend_id,
            migration_file: migration.filename,
            status: "failed",
            error: message,
          });
          failedAt = migration.filename;
          break;
        }
      }
    } finally {
      if (pg) await pg.end();
    }

    if (failedAt) {
      await adminClient
        .from("client_backends")
        .update({ provisioning_status: "failed" })
        .eq("id", client_backend_id);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Provisioning failed while applying ${failedAt}. See provisioning_log for details.`,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lastMigration = migrations[migrations.length - 1].filename;
    await adminClient
      .from("client_backends")
      .update({ provisioning_status: "ready", schema_version: lastMigration })
      .eq("id", client_backend_id);

    return new Response(
      JSON.stringify({ success: true, applied: migrations.length, schema_version: lastMigration }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[provision-client-backend] error:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
