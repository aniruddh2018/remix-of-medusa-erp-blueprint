#!/usr/bin/env node
// ============================================================================
// sync-schema-migrations.mjs
// ============================================================================
// Run this after adding any new file under supabase/migrations/ (or whenever
// you want to make sure the control plane has the latest schema on hand).
// It reads every supabase/migrations/*.sql file locally and pushes them to
// the sync-schema-migrations edge function, which upserts them into the
// control plane's `schema_migrations` table (by filename, so re-running is
// always safe). provision-client-backend replays that table's contents, in
// filename order, against a newly registered client's dedicated Supabase
// project — this script is how it gets "whatever the repo currently has".
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<control-plane-service-role-key> node scripts/sync-schema-migrations.mjs
//
// The service role key is intentionally NOT read from .env / committed
// anywhere in this repo — pass it as an env var on the command line each
// time, the same way you'd handle any other production secret.
// ============================================================================
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const migrationsDir = resolve(repoRoot, "supabase/migrations");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) — this must point at the CONTROL PLANE project.");
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY. Pass it as an env var, e.g.:");
  console.error("  SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-schema-migrations.mjs");
  process.exit(1);
}

async function main() {
  const entries = await readdir(migrationsDir);
  const sqlFiles = entries.filter((f) => f.endsWith(".sql")).sort();

  if (sqlFiles.length === 0) {
    console.error(`No .sql files found in ${migrationsDir}`);
    process.exit(1);
  }

  const files = await Promise.all(
    sqlFiles.map(async (filename) => ({
      filename,
      content: await readFile(resolve(migrationsDir, filename), "utf8"),
    }))
  );

  console.log(`Syncing ${files.length} migration file(s) to ${SUPABASE_URL}/functions/v1/sync-schema-migrations ...`);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-schema-migrations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ files }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    console.error("Sync failed:", body.error || res.statusText);
    process.exit(1);
  }

  console.log(`Done. Synced ${body.synced} migration file(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
