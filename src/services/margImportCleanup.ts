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
  blockedBy: string[]; // human-readable dependency messages
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

  if (scope === "products") {
    counts.products = await countRows("products", companyId);
    counts.batches = await countRows("inventory_batches", companyId);
    counts.purchase_items = await countRows("purchase_order_items", companyId);
    counts.sales_items = await countRows("sales_order_items", companyId);
    if (counts.purchase_items > 0) blockedBy.push("Delete Purchase History first");
    if (counts.sales_items > 0) blockedBy.push("Delete Sales History first");
    if (counts.batches > 0) blockedBy.push("Delete Opening Stock first");
  }

  if (scope === "parties") {
    counts.customers = await countRows("customers", companyId);
    counts.suppliers = await countRows("suppliers", companyId);
    counts.sales = await countRows("sales_orders", companyId);
    counts.purchases = await countRows("purchase_orders", companyId);
    if (counts.sales > 0) blockedBy.push("Delete Sales History first");
    if (counts.purchases > 0) blockedBy.push("Delete Purchase History first");
  }

  if (scope === "purchase") {
    counts.purchase_orders = await countRows("purchase_orders", companyId);
    counts.sales = await countRows("sales_orders", companyId);
    if (counts.sales > 0) blockedBy.push("Delete Sales History first (sales consume purchased stock via FIFO)");
  }

  if (scope === "sales") {
    counts.sales_orders = await countRows("sales_orders", companyId);
    counts.prescriptions = await countRows("prescriptions", companyId);
  }

  if (scope === "doctors") {
    counts.doctors = await countRows("doctors", companyId);
    counts.prescriptions = await countRows("prescriptions", companyId);
  }

  if (scope === "stock") {
    counts.batches = await countRows("inventory_batches", companyId);
    counts.movements = await countRows("inventory_movements", companyId);
    counts.openings = await countRows("inventory_opening_balances", companyId);
    counts.sales = await countRows("sales_orders", companyId);
    if (counts.sales > 0) blockedBy.push("Delete Sales History first");
  }

  if (scope === "ledger-openings") {
    counts.openings = await countRows("ledger_opening_balances", companyId);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { scope, counts, blockedBy, total };
}

/* ─────────── DELETE ─────────── */

async function del(
  table: string,
  companyId: string,
  extra?: (q: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>,
): Promise<number> {
  let q = supabase.from(table as never).delete({ count: "exact" }).eq("company_id", companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (extra) q = extra(q as any) as any;
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
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
    await safe("ledger_opening_balances", () => del("ledger_opening_balances", companyId));
  }

  if (scope === "stock") {
    await safe("inventory_movements", () => del("inventory_movements", companyId));
    await safe("inventory_opening_balances", () => del("inventory_opening_balances", companyId));
    // batches: keep referenced ones (credit/debit/scheduled register). Delete all with no refs is complex;
    // rely on FK RESTRICT to surface errors, then delete free ones.
    await safe("inventory_batches", () => del("inventory_batches", companyId));
  }

  if (scope === "sales") {
    // sales_order_items cascades from sales_orders; payments referencing sales
    await safe("payments (sales)", () => del("payments", companyId, (q) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q as any).eq("reference_type", "sales_order")));
    await safe("credit_note_items", () => del("credit_note_items", companyId));
    await safe("credit_notes", () => del("credit_notes", companyId));
    await safe("sales_orders", () => del("sales_orders", companyId));
  }

  if (scope === "purchase") {
    await safe("payments (purchase)", () => del("payments", companyId, (q) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q as any).eq("reference_type", "purchase_order")));
    await safe("debit_note_items", () => del("debit_note_items", companyId));
    await safe("debit_notes", () => del("debit_notes", companyId));
    await safe("purchase_orders", () => del("purchase_orders", companyId));
  }

  if (scope === "doctors") {
    await safe("prescription_items", () => del("prescription_items", companyId));
    await safe("prescriptions", () => del("prescriptions", companyId));
    await safe("doctors", () => del("doctors", companyId));
  }

  if (scope === "parties") {
    await safe("customers", () => del("customers", companyId));
    await safe("suppliers", () => del("suppliers", companyId));
  }

  if (scope === "products") {
    await safe("product_conversions", () => del("product_conversions", companyId));
    await safe("products", () => del("products", companyId));
  }

  return { deleted, errors };
}
