import { supabase } from "@/integrations/supabase/client";

/**
 * Stock reconciliation with CASCADING opening-balance allocation across
 * financial years.
 *
 * Flow:
 *   1. User creates past FYs and imports Purchase + Sales history into them.
 *   2. In the current FY the user imports on-hand stock (batches).
 *   3. Reconciliation walks FYs from newest → oldest. For each FY:
 *
 *        opening_of_fy = need_closing_of_fy - (purchased_in_fy - sold_in_fy)
 *
 *      `need_closing_of_fy` starts as current on-hand (for the newest FY).
 *      Any positive `opening_of_fy` becomes the opening balance recorded
 *      against that FY (== closing of the previous FY), and is fed as
 *      `need_closing` into the next iteration.
 *
 *   4. Whatever remains as `opening_of_earliestFY > 0` is the true pre-history
 *      opening balance and is recorded against the earliest FY.
 *
 * Writes go to `inventory_opening_balances` (one row per fy+product) so we
 * never double-count physical stock. Unmatched batches (products with zero
 * history) get tagged `is_carry_forward=true` on the earliest FY for
 * reporting.
 */

export interface ReconcileAllocation {
  fy_id: string;
  fy_name: string;
  fy_end_date: string;
  opening_qty: number;
}

export interface ReconcileLine {
  product_id: string;
  product_name: string;
  on_hand_qty: number;
  total_purchased_qty: number;
  total_sold_qty: number;
  allocations: ReconcileAllocation[]; // opening balances per FY
  shortfall_qty: number;              // history outflow exceeds current stock
  unmatched_batches: { id: string; batch_number: string; qty: number }[];
}

export interface FyLite { id: string; name: string; start_date: string; end_date: string; status: string }

export interface ReconcilePlan {
  companyId: string;
  fys: FyLite[]; // oldest → newest
  earliestFy: FyLite | null;
  lines: ReconcileLine[];
  totals: {
    products: number;
    total_opening_qty: number;
    total_shortfall_qty: number;
    unmatched_batches: number;
    per_fy: { fy_id: string; fy_name: string; opening_qty: number }[];
  };
}

async function loadAllFys(companyId: string): Promise<FyLite[]> {
  const { data } = await supabase
    .from("financial_years")
    .select("id,name,start_date,end_date,status")
    .eq("company_id", companyId)
    .order("start_date", { ascending: true });
  return (data ?? []) as FyLite[];
}

async function aggregatePurchaseByFy(
  companyId: string, fyIds: string[],
): Promise<Map<string, Map<string, number>>> {
  const totals = new Map<string, Map<string, number>>();
  for (const id of fyIds) totals.set(id, new Map());
  if (!fyIds.length) return totals;
  const { data: headers } = await supabase
    .from("purchase_orders").select("id,financial_year_id")
    .eq("company_id", companyId).in("financial_year_id", fyIds);
  const byOrder = new Map<string, string>();
  for (const h of (headers ?? []) as Array<{ id: string; financial_year_id: string }>) {
    byOrder.set(h.id, h.financial_year_id);
  }
  const ids = [...byOrder.keys()];
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await supabase
      .from("purchase_order_items")
      .select("product_id,quantity,free_quantity,purchase_order_id")
      .in("purchase_order_id", ids.slice(i, i + CHUNK));
    for (const row of (data ?? []) as Array<{ product_id: string; quantity: number | null; free_quantity: number | null; purchase_order_id: string }>) {
      const fyId = byOrder.get(row.purchase_order_id);
      if (!fyId) continue;
      const q = (row.quantity ?? 0) + (row.free_quantity ?? 0);
      const bucket = totals.get(fyId)!;
      bucket.set(row.product_id, (bucket.get(row.product_id) ?? 0) + q);
    }
  }
  return totals;
}

async function aggregateSalesByFy(
  companyId: string, fyIds: string[],
): Promise<Map<string, Map<string, number>>> {
  const totals = new Map<string, Map<string, number>>();
  for (const id of fyIds) totals.set(id, new Map());
  if (!fyIds.length) return totals;
  const { data: headers } = await supabase
    .from("sales_orders").select("id,financial_year_id")
    .eq("company_id", companyId).in("financial_year_id", fyIds);
  const byOrder = new Map<string, string>();
  for (const h of (headers ?? []) as Array<{ id: string; financial_year_id: string }>) {
    byOrder.set(h.id, h.financial_year_id);
  }
  const ids = [...byOrder.keys()];
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await supabase
      .from("sales_order_items")
      .select("product_id,quantity,sales_order_id")
      .in("sales_order_id", ids.slice(i, i + CHUNK));
    for (const row of (data ?? []) as Array<{ product_id: string; quantity: number | null; sales_order_id: string }>) {
      const fyId = byOrder.get(row.sales_order_id);
      if (!fyId) continue;
      const bucket = totals.get(fyId)!;
      bucket.set(row.product_id, (bucket.get(row.product_id) ?? 0) + (row.quantity ?? 0));
    }
  }
  return totals;
}

export async function computeReconciliation(companyId: string): Promise<ReconcilePlan> {
  const fys = await loadAllFys(companyId);
  const fyIds = fys.map((f) => f.id);
  const earliestFy = fys[0] ?? null;

  // 1. Current on-hand per product.
  const onHand = new Map<string, number>();
  const batchesByProduct = new Map<string, { id: string; batch_number: string; qty: number }[]>();
  let from = 0; const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("inventory_batches")
      .select("id,product_id,batch_number,quantity,loose_quantity")
      .eq("company_id", companyId)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const b of data) {
      const total = (b.quantity ?? 0) + (b.loose_quantity ?? 0);
      onHand.set(b.product_id, (onHand.get(b.product_id) ?? 0) + total);
      const arr = batchesByProduct.get(b.product_id) ?? [];
      arr.push({ id: b.id, batch_number: b.batch_number, qty: total });
      batchesByProduct.set(b.product_id, arr);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // 2. Per-FY purchase / sales aggregates.
  const [purchased, sold] = await Promise.all([
    aggregateByFy(companyId, fyIds, "purchase_orders", "purchase_order_items", "purchase_order_id", true),
    aggregateByFy(companyId, fyIds, "sales_orders", "sales_order_items", "sales_order_id", false),
  ]);

  // 3. Product names.
  const productIds = new Set<string>(onHand.keys());
  for (const m of purchased.values()) for (const k of m.keys()) productIds.add(k);
  for (const m of sold.values()) for (const k of m.keys()) productIds.add(k);
  const names = new Map<string, string>();
  const idsArr = [...productIds];
  for (let i = 0; i < idsArr.length; i += 200) {
    const { data } = await supabase.from("products").select("id,name").in("id", idsArr.slice(i, i + 200));
    for (const p of data ?? []) names.set(p.id as string, p.name as string);
  }

  // 4. Cascade opening allocation newest → oldest.
  const fysNewestFirst = [...fys].reverse();
  const lines: ReconcileLine[] = [];
  const perFyTotals = new Map<string, number>();
  let totalOpening = 0;
  let totalShortfall = 0;
  let totalUnmatched = 0;

  for (const productId of productIds) {
    const allocations: ReconcileAllocation[] = [];
    let need = onHand.get(productId) ?? 0;
    let totalPur = 0;
    let totalSol = 0;

    for (let i = 0; i < fysNewestFirst.length; i++) {
      const fy = fysNewestFirst[i];
      const pur = purchased.get(fy.id)?.get(productId) ?? 0;
      const sol = sold.get(fy.id)?.get(productId) ?? 0;
      totalPur += pur;
      totalSol += sol;
      const net = pur - sol;
      const opening = need - net; // opening required at start of THIS fy

      const isLast = i === fysNewestFirst.length - 1;
      if (opening > 0) {
        allocations.push({
          fy_id: fy.id,
          fy_name: fy.name,
          fy_end_date: fy.end_date,
          opening_qty: opening,
        });
        perFyTotals.set(fy.id, (perFyTotals.get(fy.id) ?? 0) + opening);
        totalOpening += opening;
        need = opening; // rolls back into previous FY
      } else if (opening < 0 && isLast) {
        // history has more outflow than current stock supports
        totalShortfall += -opening;
      } else {
        // opening <= 0 and not last: history already covers stock; older FYs need no opening
        need = 0;
        break;
      }
    }

    // Unmatched batches: product has NO purchase history in any FY → whole
    // on-hand is opening, and batches themselves should be flagged.
    const unmatched = totalPur === 0
      ? (batchesByProduct.get(productId) ?? []).filter((b) => b.qty > 0)
      : [];

    if (allocations.length === 0 && unmatched.length === 0) continue;

    lines.push({
      product_id: productId,
      product_name: names.get(productId) ?? "(unknown)",
      on_hand_qty: onHand.get(productId) ?? 0,
      total_purchased_qty: totalPur,
      total_sold_qty: totalSol,
      allocations,
      shortfall_qty: 0,
      unmatched_batches: unmatched,
    });
    totalUnmatched += unmatched.length;
  }

  const perFy = fys.map((f) => ({
    fy_id: f.id, fy_name: f.name, opening_qty: perFyTotals.get(f.id) ?? 0,
  }));

  return {
    companyId,
    fys,
    earliestFy,
    lines: lines.sort((a, b) => {
      const ao = a.allocations.reduce((s, x) => s + x.opening_qty, 0);
      const bo = b.allocations.reduce((s, x) => s + x.opening_qty, 0);
      return bo - ao;
    }),
    totals: {
      products: lines.length,
      total_opening_qty: totalOpening,
      total_shortfall_qty: totalShortfall,
      unmatched_batches: totalUnmatched,
      per_fy: perFy,
    },
  };
}

export interface ApplyResult {
  openingBalancesWritten: number;
  batchesTaggedAsOpening: number;
  errors: string[];
  /** Back-compat alias for older UI (== openingBalancesWritten). */
  openingBatchesCreated: number;
}

/**
 * Applies a reconciliation plan by writing `inventory_opening_balances` rows
 * per (financial_year, product). Does NOT create extra inventory_batches
 * (that would double-count physical stock).
 */
export async function applyReconciliation(plan: ReconcilePlan): Promise<ApplyResult> {
  const res: ApplyResult = { openingBalancesWritten: 0, batchesTaggedAsOpening: 0, errors: [], openingBatchesCreated: 0 };
  if (!plan.earliestFy) {
    res.errors.push("No financial year found — create one first.");
    return res;
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const line of plan.lines) {
    for (const alloc of line.allocations) {
      rows.push({
        company_id: plan.companyId,
        financial_year_id: alloc.fy_id,
        product_id: line.product_id,
        batch_id: null,
        opening_quantity: alloc.opening_qty,
        opening_value: 0,
      });
    }
  }

  if (rows.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase
        .from("inventory_opening_balances")
        .upsert(rows.slice(i, i + CHUNK) as never, {
          onConflict: "financial_year_id,product_id,batch_id",
        });
      if (error) res.errors.push(error.message);
      else res.openingBalancesWritten += Math.min(CHUNK, rows.length - i);
    }
  }

  // Tag unmatched batches (products with no purchase history) as carry-forward
  // on the earliest FY so they surface as opening in reports.
  const earliestId = plan.earliestFy.id;
  for (const line of plan.lines) {
    if (line.unmatched_batches.length === 0) continue;
    const ids = line.unmatched_batches.map((b) => b.id);
    const { error } = await supabase
      .from("inventory_batches")
      .update({ is_carry_forward: true, financial_year_id: earliestId })
      .in("id", ids);
    if (error) res.errors.push(`${line.product_name}: ${error.message}`);
    else res.batchesTaggedAsOpening += ids.length;
  }

  res.openingBatchesCreated = res.openingBalancesWritten;
  return res;
}
