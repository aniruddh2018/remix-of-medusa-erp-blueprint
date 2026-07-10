import { supabase } from "@/integrations/supabase/client";

/**
 * Stock reconciliation between historical purchase/sale imports and imported
 * current on-hand stock.
 *
 * Idea (matches the user's simpler architecture):
 *   1. User creates past FYs and imports Purchase + Sales history into them.
 *   2. In the current FY, the user imports on-hand stock (batches).
 *   3. Reconciliation compares, per product:
 *
 *        current_on_hand_qty  vs.  Σ purchases_qty_in_past_FYs − Σ sales_qty_in_past_FYs
 *
 *      If current > implied history remainder, the diff is treated as an
 *      OPENING STOCK that pre-dates all imported history. A synthetic
 *      opening batch is created against the earliest past FY.
 *
 *   4. Batches whose batch_number is *not* referenced by any past-FY purchase
 *      line are tagged as opening batches (financial_year_id = earliestPastFy,
 *      is_carry_forward = true) so ledgers/reports know they are opening.
 *
 * v1 keeps it read-mostly: `computeReconciliation` returns a plan the user
 * approves in the UI; `applyReconciliation` writes only OPENING batches +
 * opening-tag updates. It never touches existing sales/purchase orders.
 */

export interface ReconcileLine {
  product_id: string;
  product_name: string;
  on_hand_qty: number;       // imported current on-hand (sum of batches)
  purchased_qty: number;     // Σ paid+free qty in past-FY purchase lines
  sold_qty: number;          // Σ qty in past-FY sales lines
  implied_remainder: number; // purchased − sold
  opening_qty: number;       // max(on_hand − implied_remainder, 0)
  shortfall_qty: number;     // max(implied_remainder − on_hand, 0)
  unmatched_batches: { id: string; batch_number: string; qty: number }[];
}

export interface ReconcilePlan {
  companyId: string;
  earliestPastFy: { id: string; name: string; end_date: string } | null;
  lines: ReconcileLine[];
  totals: {
    products: number;
    total_opening_qty: number;
    total_shortfall_qty: number;
    unmatched_batches: number;
  };
}

async function loadPastFys(companyId: string) {
  const { data } = await supabase
    .from("financial_years")
    .select("id,name,start_date,end_date,status")
    .eq("company_id", companyId)
    .neq("status", "active")
    .order("start_date", { ascending: true });
  return data ?? [];
}

async function aggregatePurchaseQty(companyId: string, fyIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (!fyIds.length) return totals;
  const { data: headers } = await supabase
    .from("purchase_orders").select("id")
    .eq("company_id", companyId).in("financial_year_id", fyIds);
  const ids = (headers ?? []).map((h) => h.id as string);
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await supabase
      .from("purchase_order_items")
      .select("product_id,quantity,free_quantity")
      .in("purchase_order_id", ids.slice(i, i + CHUNK));
    for (const row of (data ?? []) as unknown as Array<{ product_id: string; quantity: number; free_quantity?: number }>) {
      const q = (row.quantity ?? 0) + (row.free_quantity ?? 0);
      totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + q);
    }
  }
  return totals;
}

async function aggregateSalesQty(companyId: string, fyIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (!fyIds.length) return totals;
  const { data: headers } = await supabase
    .from("sales_orders").select("id")
    .eq("company_id", companyId).in("financial_year_id", fyIds);
  const ids = (headers ?? []).map((h) => h.id as string);
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await supabase
      .from("sales_order_items")
      .select("product_id,quantity")
      .in("sales_order_id", ids.slice(i, i + CHUNK));
    for (const row of (data ?? []) as unknown as Array<{ product_id: string; quantity: number }>) {
      totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + (row.quantity ?? 0));
    }
  }
  return totals;
}

export async function computeReconciliation(companyId: string): Promise<ReconcilePlan> {
  const pastFys = await loadPastFys(companyId);
  const pastFyIds = pastFys.map((f) => f.id as string);
  const earliestPastFy = pastFys[0]
    ? { id: pastFys[0].id as string, name: pastFys[0].name as string, end_date: pastFys[0].end_date as string }
    : null;

  // 1. Current on-hand per product (all batches, ignore FY tagging — we only
  //    care about physical stock right now).
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

  // 2. Aggregate past-FY purchase and sale quantities.
  const [purchased, sold] = await Promise.all([
    aggregatePurchaseQty(companyId, pastFyIds),
    aggregateSalesQty(companyId, pastFyIds),
  ]);

  // 3. Product names for display.
  const productIds = new Set<string>([
    ...onHand.keys(), ...purchased.keys(), ...sold.keys(),
  ]);
  const names = new Map<string, string>();
  const idsArr = [...productIds];
  for (let i = 0; i < idsArr.length; i += 200) {
    const slice = idsArr.slice(i, i + 200);
    const { data } = await supabase
      .from("products").select("id,name").in("id", slice);
    for (const p of data ?? []) names.set(p.id as string, p.name as string);
  }

  // 4. Referenced batch_numbers in past-FY purchase lines — used to flag
  //    batches that are truly "opening" (not covered by history).
  //    (Reading batch numbers off purchase_order_items requires we already
  //    linked purchases → batches. In current importer we don't set it, so
  //    fall back to a lenient rule: any batch on a product with zero past
  //    purchases is considered unmatched.)
  const lines: ReconcileLine[] = [];
  let totalOpening = 0;
  let totalShortfall = 0;
  let totalUnmatched = 0;

  for (const productId of productIds) {
    const onH = onHand.get(productId) ?? 0;
    const pur = purchased.get(productId) ?? 0;
    const sol = sold.get(productId) ?? 0;
    const remainder = pur - sol;
    const opening = Math.max(onH - remainder, 0);
    const shortfall = Math.max(remainder - onH, 0);

    // Heuristic: if the product has NO past purchases, every current batch is
    // opening. Otherwise we assume batches came in via purchase history.
    const unmatched = pur === 0
      ? (batchesByProduct.get(productId) ?? []).filter((b) => b.qty > 0)
      : [];

    if (opening === 0 && shortfall === 0 && unmatched.length === 0) continue;
    lines.push({
      product_id: productId,
      product_name: names.get(productId) ?? "(unknown)",
      on_hand_qty: onH,
      purchased_qty: pur,
      sold_qty: sol,
      implied_remainder: remainder,
      opening_qty: opening,
      shortfall_qty: shortfall,
      unmatched_batches: unmatched,
    });
    totalOpening += opening;
    totalShortfall += shortfall;
    totalUnmatched += unmatched.length;
  }

  return {
    companyId,
    earliestPastFy,
    lines: lines.sort((a, b) => b.opening_qty - a.opening_qty),
    totals: {
      products: lines.length,
      total_opening_qty: totalOpening,
      total_shortfall_qty: totalShortfall,
      unmatched_batches: totalUnmatched,
    },
  };
}

export interface ApplyResult {
  openingBatchesCreated: number;
  batchesTaggedAsOpening: number;
  errors: string[];
}

/**
 * Applies a reconciliation plan:
 *   - Creates a synthetic OPENING batch per line where opening_qty > 0,
 *     dated to earliestPastFy.end_date and tagged with earliestPastFy.id.
 *   - For unmatched_batches (products with no past purchase history), tags
 *     them financial_year_id = earliestPastFy.id and is_carry_forward = true.
 *
 * Never touches sales/purchase history rows.
 */
export async function applyReconciliation(plan: ReconcilePlan): Promise<ApplyResult> {
  const res: ApplyResult = { openingBatchesCreated: 0, batchesTaggedAsOpening: 0, errors: [] };
  if (!plan.earliestPastFy) {
    res.errors.push("No past financial year found — create one first.");
    return res;
  }
  const fy = plan.earliestPastFy;

  for (const line of plan.lines) {
    try {
      if (line.opening_qty > 0) {
        const batchNo = `OPENING-${fy.end_date.replace(/-/g, "")}`;
        // Merge if it already exists on this product+batch_number.
        const { data: existing } = await supabase
          .from("inventory_batches")
          .select("id,quantity")
          .eq("company_id", plan.companyId)
          .eq("product_id", line.product_id)
          .eq("batch_number", batchNo)
          .maybeSingle();
        if (existing?.id) {
          await supabase
            .from("inventory_batches")
            .update({
              quantity: (existing.quantity ?? 0) + line.opening_qty,
              is_carry_forward: true,
              financial_year_id: fy.id,
            })
            .eq("id", existing.id);
        } else {
          const { error } = await supabase.from("inventory_batches").insert({
            company_id: plan.companyId,
            product_id: line.product_id,
            batch_number: batchNo,
            quantity: line.opening_qty,
            loose_quantity: 0,
            received_date: fy.end_date,
            is_carry_forward: true,
            financial_year_id: fy.id,
          });
          if (error) { res.errors.push(`${line.product_name}: ${error.message}`); continue; }
        }
        res.openingBatchesCreated++;
      }

      if (line.unmatched_batches.length > 0) {
        const ids = line.unmatched_batches.map((b) => b.id);
        const { error } = await supabase
          .from("inventory_batches")
          .update({ is_carry_forward: true, financial_year_id: fy.id })
          .in("id", ids);
        if (error) res.errors.push(`${line.product_name}: ${error.message}`);
        else res.batchesTaggedAsOpening += ids.length;
      }
    } catch (e) {
      res.errors.push(`${line.product_name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return res;
}
