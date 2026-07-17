import { supabase } from "@/integrations/supabase/client";
import type { ParsedPurchaseBill, ParsedPurchaseItem } from "./margPurchaseParse";

export interface PurchaseImportOptions {
  companyId: string;
  /** Stamp all resulting purchase_orders + batches with this FY id (past-FY imports). */
  financialYearId?: string | null;
  skipDuplicateBills?: boolean; // default true (by order_number)
  seedInventory?: boolean; // default true — create/update inventory_batches with qty
}

export interface PurchaseImportResult {
  totalBills: number;
  billsInserted: number;
  billsSkippedDuplicate: number;
  billsFailed: number;
  itemsInserted: number;
  itemsSkippedNoProduct: number;
  suppliersCreated: number;
  batchesCreated: number;
  batchesUpdated: number;
  unmatchedProducts: { name: string; count: number }[];
  errors: string[];
}

type Progress = (done: number, total: number) => void;
const UPPER = (s: string) => (s ?? "").toUpperCase().trim();

interface ProductLite {
  id: string;
  name: string;
  brand: string | null;
  base_unit: string | null;
}

async function preloadProducts(companyId: string) {
  const map = new Map<string, ProductLite>();
  let from = 0; const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("products").select("id,name,brand,base_unit")
      .eq("company_id", companyId).eq("is_active", true)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const p of data) {
      map.set(UPPER(p.name), p as ProductLite);
      if (p.brand) map.set(UPPER(p.brand), p as ProductLite);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

async function preloadSuppliers(companyId: string) {
  const map = new Map<string, string>();
  const { data } = await supabase
    .from("suppliers").select("id,name").eq("company_id", companyId);
  for (const s of data ?? []) map.set(UPPER(s.name), s.id);
  return map;
}

async function preloadExistingPOs(companyId: string) {
  const set = new Set<string>();
  let from = 0; const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("purchase_orders").select("order_number")
      .eq("company_id", companyId).range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data) set.add(r.order_number);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return set;
}

async function getOrCreateSupplier(
  name: string, companyId: string, cache: Map<string, string>,
  counters: { created: number },
): Promise<string | null> {
  const key = UPPER(name);
  const hit = cache.get(key);
  if (hit) return hit;
  const { data, error } = await supabase.from("suppliers")
    .insert({ company_id: companyId, name: name || "Unknown" })
    .select("id").single();
  if (error || !data) return null;
  cache.set(key, data.id);
  counters.created++;
  return data.id;
}

function inferConversion(pack: string, base?: string | null): number {
  const m1 = pack.match(/^(\d+)\*(\d+)/);
  if (m1) return parseInt(m1[2], 10);
  const m2 = pack.match(/^(\d+)'?S$/i);
  if (m2) return parseInt(m2[1], 10);
  if (/TAB|CAP/i.test(base ?? "")) return 10;
  return 1;
}

function totalQty(it: ParsedPurchaseItem, conv: number) {
  const c = conv > 0 ? conv : 1;
  const paid = it.qty_strips * c + it.qty_loose;
  const free = it.free_strips * c + it.free_loose;
  return { paid, free, total: paid + free };
}

async function upsertBatch(
  productId: string, companyId: string, supplierId: string | null,
  batchNumber: string, qty: number, looseQty: number,
  mrp: number, purchasePrice: number, receivedDate: string,
  cache: Map<string, { id: string; existed: boolean }>,
  counters: { created: number; updated: number },
  fyId?: string | null,
): Promise<string | null> {
  const key = `${productId}|${batchNumber}`;
  const cached = cache.get(key);
  if (cached) {
    const { data: row } = await supabase.from("inventory_batches")
      .select("quantity,loose_quantity").eq("id", cached.id).single();
    await supabase.from("inventory_batches").update({
      quantity: (row?.quantity ?? 0) + qty,
      loose_quantity: (row?.loose_quantity ?? 0) + looseQty,
    }).eq("id", cached.id);
    counters.updated++;
    return cached.id;
  }

  const { data: existing } = await supabase.from("inventory_batches")
    .select("id,quantity,loose_quantity")
    .eq("product_id", productId).eq("batch_number", batchNumber).maybeSingle();
  if (existing?.id) {
    await supabase.from("inventory_batches").update({
      quantity: (existing.quantity ?? 0) + qty,
      loose_quantity: (existing.loose_quantity ?? 0) + looseQty,
      mrp, purchase_price: purchasePrice,
    }).eq("id", existing.id);
    cache.set(key, { id: existing.id, existed: true });
    counters.updated++;
    return existing.id;
  }

  const { data, error } = await supabase.from("inventory_batches").insert({
    company_id: companyId, product_id: productId, supplier_id: supplierId,
    batch_number: batchNumber, quantity: qty, loose_quantity: looseQty,
    mrp, purchase_price: purchasePrice, received_date: receivedDate,
    financial_year_id: fyId ?? null,
  }).select("id").single();
  if (error || !data) return null;
  cache.set(key, { id: data.id, existed: false });
  counters.created++;
  return data.id;
}

export async function importMargPurchases(
  bills: ParsedPurchaseBill[],
  opts: PurchaseImportOptions,
  onProgress?: Progress,
): Promise<PurchaseImportResult> {
  const result: PurchaseImportResult = {
    totalBills: bills.length,
    billsInserted: 0, billsSkippedDuplicate: 0, billsFailed: 0,
    itemsInserted: 0, itemsSkippedNoProduct: 0,
    suppliersCreated: 0, batchesCreated: 0, batchesUpdated: 0,
    unmatchedProducts: [], errors: [],
  };
  const skipDup = opts.skipDuplicateBills ?? true;
  const seed = opts.seedInventory ?? true;

  const [products, suppliers, existingPOs] = await Promise.all([
    preloadProducts(opts.companyId),
    preloadSuppliers(opts.companyId),
    skipDup ? preloadExistingPOs(opts.companyId) : Promise.resolve(new Set<string>()),
  ]);
  const batchCache = new Map<string, { id: string; existed: boolean }>();
  const supplierCounters = { created: 0 };
  const batchCounters = { created: 0, updated: 0 };
  const unmatched = new Map<string, number>();

  let done = 0;
  for (const bill of bills) {
    try {
      if (skipDup && existingPOs.has(bill.bill_no)) {
        result.billsSkippedDuplicate++; done++; onProgress?.(done, bills.length); continue;
      }

      const resolved: Array<{ it: ParsedPurchaseItem; p: ProductLite; conv: number }> = [];
      for (const it of bill.items) {
        const p = products.get(UPPER(it.name));
        if (!p) {
          unmatched.set(it.name, (unmatched.get(it.name) ?? 0) + 1);
          result.itemsSkippedNoProduct++;
          continue;
        }
        resolved.push({ it, p, conv: inferConversion(it.pack, p.base_unit) });
      }
      if (resolved.length === 0) {
        result.billsFailed++;
        result.errors.push(`${bill.bill_no}: no items matched products`);
        done++; onProgress?.(done, bills.length); continue;
      }

      const supplierId = await getOrCreateSupplier(
        bill.supplier_name, opts.companyId, suppliers, supplierCounters,
      );
      if (!supplierId) {
        result.billsFailed++;
        result.errors.push(`${bill.bill_no}: supplier create failed`);
        done++; onProgress?.(done, bills.length); continue;
      }

      const poInsert = {
        company_id: opts.companyId,
        financial_year_id: opts.financialYearId ?? null,
        order_number: bill.bill_no,
        order_date: bill.bill_date,
        supplier_id: supplierId,
        supplier_invoice_number: bill.bill_no,
        supplier_invoice_date: bill.bill_date,
        invoice_number: bill.bill_no,
        is_challan: false,
        total_amount: bill.bill_total || bill.net_amount + bill.tax,
        gst_amount: bill.tax,
        discount_amount: bill.discount,
        freight_charges: 0, handling_charges: 0, other_charges: 0,
        is_interstate: false,
        status: "confirmed" as const,
      };
      const { data: po, error: poErr } = await supabase.from("purchase_orders")
        .insert(poInsert).select("id").single();
      if (poErr || !po) {
        result.billsFailed++;
        result.errors.push(`${bill.bill_no}: ${poErr?.message ?? "po insert failed"}`);
        done++; onProgress?.(done, bills.length); continue;
      }
      existingPOs.add(bill.bill_no);

      const itemRows: Array<Record<string, unknown>> = [];
      for (const r of resolved) {
        const { paid, free, total } = totalQty(r.it, r.conv);
        const batchNo = r.it.batch_number || "LEGACY";
        if (seed) {
          await upsertBatch(
            r.p.id, opts.companyId, supplierId, batchNo, total, 0,
            r.it.rate, r.it.rate, bill.bill_date, batchCache, batchCounters,
            opts.financialYearId ?? null,
          );
        }
        const qty = Math.max(1, paid);
        itemRows.push({
          purchase_order_id: po.id,
          company_id: opts.companyId,
          product_id: r.p.id,
          quantity: qty,
          free_quantity: free,
          unit_price: r.it.rate,
          discount_percentage: 0,
          gst_percentage: 0,
          total_price: r.it.amount,
        });
      }
      if (itemRows.length > 0) {
        const { error: iErr } = await supabase.from("purchase_order_items").insert(itemRows as never);
        if (iErr) result.errors.push(`${bill.bill_no} items: ${iErr.message}`);
        else result.itemsInserted += itemRows.length;
      }
      result.billsInserted++;
    } catch (err) {
      result.billsFailed++;
      result.errors.push(`${bill.bill_no}: ${err instanceof Error ? err.message : String(err)}`);
    }
    done++;
    if (done % 25 === 0) onProgress?.(done, bills.length);
  }
  onProgress?.(bills.length, bills.length);

  result.suppliersCreated = supplierCounters.created;
  result.batchesCreated = batchCounters.created;
  result.batchesUpdated = batchCounters.updated;
  result.unmatchedProducts = [...unmatched.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count).slice(0, 100);
  return result;
}

export function purchaseUnmatchedToCsv(items: PurchaseImportResult["unmatchedProducts"]): string {
  const lines = ["product_name,occurrences"];
  for (const r of items) lines.push(`"${r.name.replace(/"/g, '""')}",${r.count}`);
  return lines.join("\n");
}
