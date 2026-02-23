import { supabase } from "@/integrations/supabase/client";

const BACKUP_TABLES = [
  "products",
  "inventory_batches",
  "suppliers",
  "customers",
  "purchase_orders",
  "purchase_order_items",
  "sales_orders",
  "sales_order_items",
  "payments",
  "credit_notes",
  "credit_note_items",
  "debit_notes",
  "debit_note_items",
  "scheduled_drug_register",
  "tax_sessions",
] as const;

type BackupTable = (typeof BACKUP_TABLES)[number];

const LAST_BACKUP_KEY = "last_backup_timestamp";

function escapeSQL(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

function rowToInsert(table: string, row: Record<string, unknown>): string {
  const columns = Object.keys(row).join(", ");
  const values = Object.values(row).map(escapeSQL).join(", ");
  // ON CONFLICT DO UPDATE for idempotent restores
  const updateCols = Object.keys(row)
    .filter((c) => c !== "id")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  return `INSERT INTO public.${table} (${columns}) VALUES (${values}) ON CONFLICT (id) DO UPDATE SET ${updateCols};`;
}

export function getLastBackupDate(): string | null {
  return localStorage.getItem(LAST_BACKUP_KEY);
}

export function setLastBackupDate(date: string) {
  localStorage.setItem(LAST_BACKUP_KEY, date);
}

async function fetchTableData(
  table: BackupTable,
  since?: string
): Promise<Record<string, unknown>[]> {
  let query = supabase.from(table).select("*");
  if (since) {
    // For incremental: get records updated after last backup
    query = query.gte("updated_at", since);
  }
  // Paginate to avoid 1000-row limit
  const allRows: Record<string, unknown>[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) {
      console.error(`Error fetching ${table}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...(data as Record<string, unknown>[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

export interface BackupProgress {
  table: string;
  current: number;
  total: number;
}

export async function generateBackupSQL(
  incremental: boolean,
  onProgress?: (p: BackupProgress) => void
): Promise<{ sql: string; rowCount: number; tableStats: Record<string, number> }> {
  const since = incremental ? getLastBackupDate() : undefined;
  const now = new Date().toISOString();
  const lines: string[] = [];
  const tableStats: Record<string, number> = {};
  let totalRows = 0;

  lines.push("-- ================================================");
  lines.push(`-- Database Backup - ${incremental ? "INCREMENTAL" : "FULL"}`);
  lines.push(`-- Generated: ${now}`);
  if (since) lines.push(`-- Changes since: ${since}`);
  lines.push("-- Compatible with Supabase PostgreSQL restore");
  lines.push("-- Use: psql or Supabase SQL Editor to restore");
  lines.push("-- ================================================");
  lines.push("");
  lines.push("BEGIN;");
  lines.push("");

  for (let i = 0; i < BACKUP_TABLES.length; i++) {
    const table = BACKUP_TABLES[i];
    onProgress?.({ table, current: i, total: BACKUP_TABLES.length });

    const rows = await fetchTableData(table, since || undefined);
    tableStats[table] = rows.length;
    totalRows += rows.length;

    if (rows.length > 0) {
      lines.push(`-- Table: ${table} (${rows.length} rows)`);
      for (const row of rows) {
        lines.push(rowToInsert(table, row));
      }
      lines.push("");
    }
  }

  lines.push("COMMIT;");
  lines.push("");
  lines.push(`-- Backup complete. Total rows: ${totalRows}`);

  // Save last backup timestamp
  setLastBackupDate(now);

  return { sql: lines.join("\n"), rowCount: totalRows, tableStats };
}

export function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/sql" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
