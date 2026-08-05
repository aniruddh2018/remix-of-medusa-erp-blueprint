/**
 * Per-step "Remove old imports" service.
 *
 * Each scope enforces dependency order: dependent data must be removed
 * BEFORE its parent scope. Callers receive `blockedBy` messages when
 * the scope can't safely delete due to downstream rows.
 *
 * All deletes are scoped to `company_id` — never global.
 */
import { supabase } from "@/integrations/supabase/client";

export type CleanupScope =
  | "products"
  | "parties"
  | "purchase"
  | "sales"
  | "doctors"
  | "stock"
  | "ledger-openings";

export interface CleanupPreview {
  scope: CleanupScope;
  counts: Record<string, number>;
  blockedBy: string[]; // real blockers — deletion is prevented
  warn: string[];     // informational — data will be auto-deleted but user should know
  total: number;
}

export interface CleanupResult {
  deleted: Record<string, number>;
  errors: string[];
}

async function countRows(
  table: string,
  companyId: string,
  extra?: (q: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>,
): Promise<number> {
  let q = supabase.from(table as never).select("id", { count: "exact", head: true }).eq("company_id", companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (extra) q = extra(q as any) as any;
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/* ─────────── PREVIEW ─────────── */

export async function previewCleanup(scope: CleanupScope, companyId: string): Promise<CleanupPreview> {
  const counts: Record<string, number> = {};
  const blockedBy: string[] = [];
  const warn: string[] = [];

  if (scope === "products") {
    counts.products = await countRows("products", companyId);
    counts.batches = await countRows("inventory_batches", companyId);
    counts.purchase_items = await countRows("purchase_order_items", companyId);
    counts.sales_items = await countRows("sales_order_items", companyId);
    counts.product_conversions = await countRows("product_conversions", companyId);
    if (counts.purchase_items > 0) blockedBy.push("Delete Purchase History first");
    if (counts.sales_items > 0) blockedBy.push("Delete Sales History first");
    if (counts.batches > 0) blockedBy.push("Delete Opening Stock first");
  }

  if (scope === "parties") {
    counts.customers = await countRows("customers", companyId);
    counts.suppliers = await countRows("suppliers", companyId);
    counts.sales = await countRows("sales_orders", companyId);
    counts.purchases = await countRows("purchase_orders", companyId);
    counts.batches = await countRows("inventory_batches", companyId);
    if (counts.sales > 0) blockedBy.push("Delete Sales History first");
    if (counts.purchases > 0) blockedBy.push("Delete Purchase History first");
    if (counts.batches > 0) blockedBy.push("Delete Opening Stock first");
  }

  if (scope === "purchase") {
    counts.purchase_orders = await countRows("purchase_orders", companyId);
    counts.purchase_order_items = await countRows("purchase_order_items", companyId);
    counts.debit_notes = await countRows("debit_notes", companyId);
    counts.sales = await countRows("sales_orders", companyId);
    if (counts.sales > 0) blockedBy.push("Delete Sales History first (sales consume purchased stock via FIFO)");
    if (counts.purchase_order_items > 0) warn.push(`${counts.purchase_order_items} purchase order item(s) will be deleted automatically`);
    if (counts.debit_notes > 0) warn.push(`${counts.debit_notes} debit note(s) will be deleted automatically`);
  }

  if (scope === "sales") {
    counts.sales_orders = await countRows("sales_orders", companyId);
    counts.sales_order_items = await countRows("sales_order_items", companyId);
    counts.credit_notes = await countRows("credit_notes", companyId);
    counts.prescriptions = await countRows("prescriptions", companyId);
    if (counts.credit_notes > 0) warn.push(`${counts.credit_notes} credit note(s) will be deleted automatically`);
    if (counts.prescriptions > 0) warn.push(`${counts.prescriptions} prescription(s) will be deleted automatically`);
  }

  if (scope === "doctors") {
    counts.doctors = await countRows("doctors", companyId);
    counts.prescriptions = await countRows("prescriptions", companyId);
    counts.prescription_items = await countRows("prescription_items", companyId);
    if (counts.prescriptions > 0) warn.push(`${counts.prescriptions} prescription(s) will be deleted automatically`);
    if (counts.prescription_items > 0) warn.push(`${counts.prescription_items} prescription item(s) will be deleted automatically`);
  }

  if (scope === "stock") {
    counts.batches = await countRows("inventory_batches", companyId);
    counts.movements = await countRows("inventory_movements", companyId);
    counts.openings = await countRows("inventory_opening_balances", companyId);
    counts.sales = await countRows("sales_orders", companyId);
    counts.sales_order_items = await countRows("sales_order_items", companyId);
    counts.purchase_order_items = await countRows("purchase_order_items", companyId);
    if (counts.sales > 0) blockedBy.push("Delete Sales History first");
    if (counts.sales_order_items > 0) blockedBy.push("Delete Sales History first (items still reference batches)");
    if (counts.purchase_order_items > 0) blockedBy.push("Delete Purchase History first (items still reference batches)");
  }

  if (scope === "ledger-openings") {
    counts.openings = await countRows("ledger_opening_balances", companyId);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { scope, counts, blockedBy, warn, total };
}

/* ─────────── DELETE ─────────── */

/**
 * Batch-delete rows by ID to avoid per-row trigger timeouts and
 * PostgREST 8-second query limits.
 *
 * Selects IDs in pages of 1000, then deletes in chunks of 100.
 * Any table with more than a few hundred rows can hit the timeout
 * when deleted in a single `DELETE … WHERE company_id = …` request.
 *
 * Tables with per-row triggers (sales_orders, purchase_orders, payments)
 * cascade into journal_vouchers → journal_voucher_lines, which
 * recalculates ledger balances. Even tables without triggers can
 * timeout if the row count is large enough.
 */
async function delBatched(
  table: string,
  companyId: string,
  idColumn: string,
  extra?: (q: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>,
): Promise<number> {
  const PAGE = 1000;
  const BATCH = 100;
  let totalDeleted = 0;

  for (;;) {
    let q = supabase.from(table as never).select(idColumn, { head: false })
      .eq("company_id", companyId)
      .limit(PAGE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (extra) q = extra(q as any) as any;
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;

    const ids = (data as Record<string, unknown>[]).map((r) => r[idColumn]);
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      // Double guard: company_id + id IN chunk. The SELECT already filtered by
      // company_id, but this ensures a row from another company can never be
      // deleted even if an ID collision or race condition ever occurs.
      let dq = supabase.from(table as never).delete({ count: "exact" })
        .eq("company_id", companyId)
        .in(idColumn, chunk);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (extra) dq = extra(dq as any) as any;
      const { count, error: dErr } = await dq;
      if (dErr) throw dErr;
      totalDeleted += count ?? 0;
    }
  }
  return totalDeleted;
}

export async function runCleanup(scope: CleanupScope, companyId: string): Promise<CleanupResult> {
  const deleted: Record<string, number> = {};
  const errors: string[] = [];

  const safe = async (label: string, fn: () => Promise<number>) => {
    try { deleted[label] = await fn(); }
    catch (e) { errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); }
  };

  // Re-check dependencies before deleting.
  const preview = await previewCleanup(scope, companyId);
  if (preview.blockedBy.length) {
    return { deleted, errors: preview.blockedBy };
  }

  if (scope === "ledger-openings") {
    await safe("ledger_opening_balances", () => delBatched("ledger_opening_balances", companyId, "id"));
  }

  if (scope === "stock") {
    await safe("inventory_movements", () => delBatched("inventory_movements", companyId, "id"));
    await safe("inventory_opening_balances", () => delBatched("inventory_opening_balances", companyId, "id"));
    // batches: keep referenced ones (credit/debit/scheduled register). Delete all with no refs is complex;
    // rely on FK RESTRICT to surface errors, then delete free ones.
    await safe("inventory_batches", () => delBatched("inventory_batches", companyId, "id"));
  }

  if (scope === "sales") {
    // Delete child data first so FK constraints / SET NULL don’t orphan rows.
    await safe("credit_note_items", () => delBatched("credit_note_items", companyId, "id"));
    await safe("credit_notes", () => delBatched("credit_notes", companyId, "id"));
    // sales_order_items references sales_orders with ON DELETE SET NULL —
    // delete explicitly so items are not orphaned.
    await safe("sales_order_items", () => delBatched("sales_order_items", companyId, "id"));
    // payments and sales_orders both have per-row triggers that cascade
    // into journal_vouchers → journal_voucher_lines.
    await safe("payments (sales)", () => delBatched(
      "payments", companyId, "id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q) => (q as any).eq("reference_type", "sales_order"),
    ));
    await safe("sales_orders", () => delBatched("sales_orders", companyId, "id"));
  }

  if (scope === "purchase") {
    await safe("debit_note_items", () => delBatched("debit_note_items", companyId, "id"));
    await safe("debit_notes", () => delBatched("debit_notes", companyId, "id"));
    // purchase_order_items references purchase_orders; some schemas have
    // ON DELETE CASCADE, others NO ACTION. Delete explicitly to stay safe.
    await safe("purchase_order_items", () => delBatched("purchase_order_items", companyId, "id"));
    // purchase_orders also has trg_delete_purchase_voucher (per-row).
    await safe("payments (purchase)", () => delBatched(
      "payments", companyId, "id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q) => (q as any).eq("reference_type", "purchase_order"),
    ));
    await safe("purchase_orders", () => delBatched("purchase_orders", companyId, "id"));
  }

  if (scope === "doctors") {
    await safe("prescription_items", () => delBatched("prescription_items", companyId, "id"));
    await safe("prescriptions", () => delBatched("prescriptions", companyId, "id"));
    await safe("doctors", () => delBatched("doctors", companyId, "id"));
  }

  if (scope === "parties") {
    await safe("customers", () => delBatched("customers", companyId, "id"));
    await safe("suppliers", () => delBatched("suppliers", companyId, "id"));
  }

  if (scope === "products") {
    await safe("product_conversions", () => delBatched("product_conversions", companyId, "id"));
    await safe("products", () => delBatched("products", companyId, "id"));
  }

  return { deleted, errors };
}
