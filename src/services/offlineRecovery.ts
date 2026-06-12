/**
 * Offline Recovery
 *
 * Restores data from either:
 *   1. A legacy Dexie auto-export JSON: `{ tables: { <name>: rows[] } }`
 *      (also accepts the looser `{ <table>: rows[] }` shape).
 *   2. A backup .sql file produced by BackupSection (uses INSERT ... ON
 *      CONFLICT statements).
 *
 * All recovered rows are upserted via the Supabase client, so RLS still
 * applies and the data is scoped to the current user's company_id.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/** Tables we are willing to write into during recovery. */
export const RECOVERY_TABLES = [
  "customers",
  "suppliers",
  "doctors",
  "products",
  "inventory_batches",
  "inventory_transactions",
  "purchase_orders",
  "purchase_order_items",
  "sales_orders",
  "sales_order_items",
  "payments",
  "credit_notes",
  "credit_note_items",
  "debit_notes",
  "debit_note_items",
  "batch_conversions",
  "scheduled_drug_register",
  "tax_sessions",
] as const;

export type RecoveryTable = (typeof RECOVERY_TABLES)[number];

const RECOVERY_SET = new Set<string>(RECOVERY_TABLES);

/** Local-only fields produced by the old Dexie layer — must be stripped. */
const LOCAL_FIELDS = new Set(["_sync_state", "_local_updated_at"]);

export interface TableResult {
  table: string;
  attempted: number;
  inserted: number;
  errors: string[];
}

export interface RecoveryResult {
  source: "json" | "sql";
  tables: TableResult[];
  totalInserted: number;
  totalAttempted: number;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

function normaliseJsonShape(parsed: unknown): Record<string, unknown[]> {
  if (!parsed || typeof parsed !== "object") return {};
  const obj = parsed as Record<string, unknown>;
  // Dexie auto-dump: { exported_at, db_name, tables: { ... } }
  if (obj.tables && typeof obj.tables === "object" && !Array.isArray(obj.tables)) {
    return obj.tables as Record<string, unknown[]>;
  }
  // Flat shape: { table_name: rows[] }
  const out: Record<string, unknown[]> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) out[k] = v;
  }
  return out;
}

/**
 * Parse a backup .sql file produced by `utils/backupGenerator.ts`.
 * Statement shape:
 *   INSERT INTO public.<table> (col, col, ...) VALUES (v, v, ...) ON CONFLICT ...;
 */
function parseSqlDump(sql: string): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  const re = /INSERT\s+INTO\s+public\.(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const table = m[1];
    const cols = m[2].split(",").map((c) => c.trim());
    const valuesStart = re.lastIndex;
    const valuesEnd = findClosingParen(sql, valuesStart);
    if (valuesEnd < 0) continue;
    const valuesStr = sql.slice(valuesStart, valuesEnd);
    const vals = splitSqlValues(valuesStr);
    if (vals.length !== cols.length) continue;
    const row: Record<string, unknown> = {};
    for (let i = 0; i < cols.length; i++) row[cols[i]] = vals[i];
    (out[table] ||= []).push(row);
    // Advance past the closing paren so the regex resumes after it.
    re.lastIndex = valuesEnd + 1;
  }
  return out;
}

function findClosingParen(s: string, from: number): number {
  let depth = 1;
  let inStr = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "'") {
        if (s[i + 1] === "'") { i++; continue; }
        inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function splitSqlValues(str: string): unknown[] {
  const out: unknown[] = [];
  let buf = "";
  let inStr = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      if (c === "'") {
        if (str[i + 1] === "'") { buf += "'"; i++; continue; }
        inStr = false;
        buf += "\x00STR\x00"; // marker that this token was a quoted string
      } else {
        buf += c;
      }
      continue;
    }
    if (c === "'") { inStr = true; continue; }
    if (c === ",") { out.push(coerceSqlValue(buf)); buf = ""; continue; }
    buf += c;
  }
  if (buf.length || out.length) out.push(coerceSqlValue(buf));
  return out;
}

function coerceSqlValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.endsWith("\x00STR\x00")) {
    // Was a quoted string. Reconstruct by stripping the marker and
    // restoring any embedded contents (already unescaped above).
    const body = trimmed.slice(0, -"\x00STR\x00".length);
    // Try to parse JSON-shaped strings back to objects.
    if ((body.startsWith("{") && body.endsWith("}")) ||
        (body.startsWith("[") && body.endsWith("]"))) {
      try { return JSON.parse(body); } catch { /* fall through */ }
    }
    return body;
  }
  if (trimmed === "NULL" || trimmed === "") return null;
  if (trimmed === "TRUE") return true;
  if (trimmed === "FALSE") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function cleanRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (LOCAL_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

// ─── Execution ───────────────────────────────────────────────────────────────

export async function detectAndParse(file: File): Promise<{
  source: "json" | "sql";
  tables: Record<string, unknown[]>;
}> {
  const text = await file.text();
  const isJson =
    file.name.toLowerCase().endsWith(".json") ||
    text.trimStart().startsWith("{") ||
    text.trimStart().startsWith("[");
  if (isJson) {
    return { source: "json", tables: normaliseJsonShape(JSON.parse(text)) };
  }
  return { source: "sql", tables: parseSqlDump(text) };
}

export interface RecoveryOptions {
  companyId: string;
  /** Called after each table finishes. */
  onProgress?: (done: number, total: number, current: string) => void;
  /** Per-table upsert batch size. */
  batchSize?: number;
}

export async function runRecovery(
  file: File,
  opts: RecoveryOptions,
): Promise<RecoveryResult> {
  const { source, tables } = await detectAndParse(file);
  const batchSize = opts.batchSize ?? 200;

  const tableNames = Object.keys(tables).filter((t) => RECOVERY_SET.has(t));
  const result: RecoveryResult = {
    source,
    tables: [],
    totalInserted: 0,
    totalAttempted: 0,
  };

  for (let i = 0; i < tableNames.length; i++) {
    const table = tableNames[i] as RecoveryTable;
    opts.onProgress?.(i, tableNames.length, table);

    const rawRows = (tables[table] || []).filter(
      (r): r is Record<string, unknown> =>
        !!r && typeof r === "object" && !Array.isArray(r),
    );
    const rows = rawRows
      .map(cleanRow)
      // Force the current company so cross-tenant data can't be replayed.
      .map((r) => ({ ...r, company_id: opts.companyId }))
      // Skip soft-deleted rows from the offline cache.
      .filter((r) => r.deleted !== true && r.deleted !== "true");

    const tr: TableResult = {
      table,
      attempted: rows.length,
      inserted: 0,
      errors: [],
    };

    for (let j = 0; j < rows.length; j += batchSize) {
      const slice = rows.slice(j, j + batchSize);
      try {
        const { error, count } = await (supabase
          .from(table as keyof Database["public"]["Tables"]) as never)
          .upsert(slice, { onConflict: "id", count: "exact" });
        if (error) {
          tr.errors.push(error.message);
        } else {
          tr.inserted += count ?? slice.length;
        }
      } catch (e) {
        tr.errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    result.tables.push(tr);
    result.totalInserted += tr.inserted;
    result.totalAttempted += tr.attempted;
  }

  opts.onProgress?.(tableNames.length, tableNames.length, "done");
  return result;
}
