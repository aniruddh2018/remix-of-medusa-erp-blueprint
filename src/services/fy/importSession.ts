import { supabase } from "@/integrations/supabase/client";
import { tryResolveFinancialYear } from "./resolver";

export type ImportEntity =
  | "sales"
  | "purchases"
  | "payments"
  | "receipts"
  | "journal"
  | "stock_opening"
  | "ledger_opening";

export interface StagedRow {
  source_row_number?: number;
  transaction_date?: string; // YYYY-MM-DD
  raw_data: Record<string, unknown>;
}

export async function createImportSession(input: {
  companyId: string;
  source: "marg" | "tally" | "csv" | "manual";
  entityType: ImportEntity;
  fileName?: string;
  userId?: string;
}) {
  const { data, error } = await supabase
    .from("fy_import_sessions")
    .insert({
      company_id: input.companyId,
      source: input.source,
      entity_type: input.entityType,
      file_name: input.fileName ?? null,
      created_by: input.userId ?? null,
      status: "PENDING",
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function stageRows(
  sessionId: string,
  companyId: string,
  entityType: ImportEntity,
  rows: StagedRow[],
) {
  if (!rows.length) return;
  // Resolve FY per row up front
  const resolved = await Promise.all(
    rows.map(async (r) => {
      let fyId: string | null = null;
      if (r.transaction_date) {
        try {
          fyId = await tryResolveFinancialYear(companyId, r.transaction_date);
        } catch { fyId = null; }
      }
      return { r, fyId };
    }),
  );

  type RowInsert = {
    import_session_id: string;
    company_id: string;
    entity_type: string;
    source_row_number: number | null;
    transaction_date: string | null;
    resolved_financial_year_id: string | null;
    status: "PENDING" | "VALIDATED" | "NEEDS_REVIEW" | "IMPORTED" | "FAILED";
    error_code: string | null;
    error_message: string | null;
    raw_data: unknown;
  };
  const payload: RowInsert[] = resolved.map(({ r, fyId }) => ({
    import_session_id: sessionId,
    company_id: companyId,
    entity_type: entityType,
    source_row_number: r.source_row_number ?? null,
    transaction_date: r.transaction_date ?? null,
    resolved_financial_year_id: fyId,
    status: fyId ? "VALIDATED" : "NEEDS_REVIEW",
    error_code: fyId ? null : (r.transaction_date ? "FY_NOT_FOUND" : "MISSING_DATE"),
    error_message: fyId
      ? null
      : r.transaction_date
        ? `No Financial Year covers ${r.transaction_date}`
        : "Row has no transaction date",
    raw_data: r.raw_data as unknown,
  }));

  // Chunk to avoid payload limits
  const CHUNK = 500;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error } = await supabase.from("fy_import_rows").insert(payload.slice(i, i + CHUNK));
    if (error) throw error;
  }
}

export async function summarizeSession(sessionId: string) {
  const { data, error } = await supabase
    .from("fy_import_rows")
    .select("status, resolved_financial_year_id")
    .eq("import_session_id", sessionId);
  if (error) throw error;

  const rows = (data ?? []) as { status: string; resolved_financial_year_id: string | null }[];
  const byStatus: Record<string, number> = {};
  const byFy: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.resolved_financial_year_id)
      byFy[r.resolved_financial_year_id] = (byFy[r.resolved_financial_year_id] ?? 0) + 1;
  }

  const total = rows.length;
  await supabase
    .from("fy_import_sessions")
    .update({
      total_rows: total,
      valid_rows: byStatus["VALIDATED"] ?? 0,
      review_rows: byStatus["NEEDS_REVIEW"] ?? 0,
      invalid_rows: byStatus["FAILED"] ?? 0,
      summary: { by_status: byStatus, by_fy: byFy },
    })
    .eq("id", sessionId);

  return { total, byStatus, byFy };
}

export async function listSessions(companyId: string) {
  const { data, error } = await supabase
    .from("fy_import_sessions")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function deleteSession(sessionId: string) {
  const { error } = await supabase.from("fy_import_sessions").delete().eq("id", sessionId);
  if (error) throw error;
}
