import { supabase } from "@/integrations/supabase/client";
import type { ParsedBill, ParsedBillItem } from "./margSalesParse";

export interface SalesImportOptions {
  companyId: string;
  defaultCustomerName?: string;
  skipDuplicateInvoices?: boolean; // default true
  affectInventory?: boolean; // default false — write inventory_transactions
}

export interface SalesImportResult {
  totalBills: number;
  billsInserted: number;
  billsSkippedDuplicate: number;
  billsFailed: number;
  itemsInserted: number;
  itemsSkippedNoProduct: number;
  customersCreated: number;
  unmatchedProducts: { name: string; count: number }[];
  errors: string[];
}

type ProgressFn = (done: number, total: number) => void;

const BATCH_SIZE = 50; // bills per chunk

const UPPER = (s: string) => (s ?? "").toUpperCase().trim();

interface ProductLite {
  id: string;
  name: string;
  brand: string | null;
  base_unit: string | null;
}

async function preloadProducts(companyId: string): Promise<Map<string, ProductLite>> {
  const map = new Map<string, ProductLite>();
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select("id,name,brand,base_unit")
      .eq("company_id", companyId)
      .eq("is_active", true)
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

async function preloadCustomers(companyId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("customers")
      .select("id,phone,name")
      .eq("company_id", companyId)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const c of data) {
      if (c.phone) map.set(`p:${c.phone}`, c.id);
      map.set(`n:${UPPER(c.name)}`, c.id);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

async function preloadExistingInvoices(companyId: string): Promise<Set<string>> {
  const set = new Set<string>();
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("sales_orders")
      .select("invoice_number")
      .eq("company_id", companyId)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data) set.add(r.invoice_number);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return set;
}

function totalQty(item: ParsedBillItem, conv: number): number {
  const c = conv > 0 ? conv : 1;
  return item.qty_strips * c + item.qty_loose;
}

function inferConversion(pack: string, base?: string | null): number {
  // "1*10" -> 10 ; "10'S" -> 10 ; "200ML" -> 1 (loose ml billed separately)
  const m1 = pack.match(/^(\d+)\*(\d+)/);
  if (m1) return parseInt(m1[2], 10);
  const m2 = pack.match(/^(\d+)'?S$/i);
  if (m2) return parseInt(m2[1], 10);
  if (/TAB|CAP/i.test(base ?? "")) return 10;
  return 1;
}

async function getOrCreateCustomer(
  bill: ParsedBill,
  companyId: string,
  cache: Map<string, string>,
  counters: { created: number },
): Promise<string | null> {
  const key = bill.customer_phone
    ? `p:${bill.customer_phone}`
    : `n:${UPPER(bill.customer_name)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const insert = {
    company_id: companyId,
    name: bill.customer_name || "Walk-in",
    phone: bill.customer_phone ?? null,
  };
  const { data, error } = await supabase
    .from("customers")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    // phone unique violation? fall back to a name-only lookup
    if (bill.customer_phone) {
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", bill.customer_phone)
        .maybeSingle();
      if (existing?.id) {
        cache.set(key, existing.id);
        return existing.id;
      }
    }
    return null;
  }
  cache.set(key, data.id);
  counters.created++;
  return data.id;
}

async function getOrCreateBatch(
  productId: string,
  companyId: string,
  batchNumber: string,
  expiry: string | null,
  mrp: number,
  cache: Map<string, string>,
): Promise<string | null> {
  const key = `${productId}|${batchNumber}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const { data: existing } = await supabase
    .from("inventory_batches")
    .select("id")
    .eq("product_id", productId)
    .eq("batch_number", batchNumber)
    .maybeSingle();
  if (existing?.id) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("inventory_batches")
    .insert({
      company_id: companyId,
      product_id: productId,
      batch_number: batchNumber,
      quantity: 0,
      loose_quantity: 0,
      expiry_date: expiry,
      purchase_price: mrp,
      mrp,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  cache.set(key, data.id);
  return data.id;
}

export async function importMargSales(
  bills: ParsedBill[],
  opts: SalesImportOptions,
  onProgress?: ProgressFn,
): Promise<SalesImportResult> {
  const result: SalesImportResult = {
    totalBills: bills.length,
    billsInserted: 0,
    billsSkippedDuplicate: 0,
    billsFailed: 0,
    itemsInserted: 0,
    itemsSkippedNoProduct: 0,
    customersCreated: 0,
    unmatchedProducts: [],
    errors: [],
  };
  const skipDup = opts.skipDuplicateInvoices ?? true;

  const [products, customers, existingInvoices] = await Promise.all([
    preloadProducts(opts.companyId),
    preloadCustomers(opts.companyId),
    skipDup ? preloadExistingInvoices(opts.companyId) : Promise.resolve(new Set<string>()),
  ]);
  const batchCache = new Map<string, string>();
  const unmatched = new Map<string, number>();
  const customerCounters = { created: 0 };

  let done = 0;
  for (const bill of bills) {
    try {
      if (skipDup && existingInvoices.has(bill.invoice_number)) {
        result.billsSkippedDuplicate++;
        done++;
        onProgress?.(done, bills.length);
        continue;
      }

      // Resolve items first; skip bill if zero matched products
      const resolvedItems: Array<{
        item: ParsedBillItem;
        product: ProductLite;
        qty: number;
      }> = [];
      for (const it of bill.items) {
        const p = products.get(UPPER(it.name));
        if (!p) {
          unmatched.set(it.name, (unmatched.get(it.name) ?? 0) + 1);
          result.itemsSkippedNoProduct++;
          continue;
        }
        const conv = inferConversion(it.pack, p.base_unit);
        resolvedItems.push({ item: it, product: p, qty: totalQty(it, conv) });
      }
      if (resolvedItems.length === 0) {
        result.billsFailed++;
        result.errors.push(`${bill.invoice_number}: no items resolved to existing products`);
        done++;
        onProgress?.(done, bills.length);
        continue;
      }

      const customerId = await getOrCreateCustomer(bill, opts.companyId, customers, customerCounters);

      const orderInsert = {
        company_id: opts.companyId,
        invoice_number: bill.invoice_number,
        sale_date: bill.bill_date,
        customer_id: customerId,
        customer_name: bill.customer_name,
        customer_phone: bill.customer_phone,
        total_amount: bill.bill_value,
        gst_amount: 0,
        discount_amount: 0,
        amount_paid: bill.payment_mode === "cash" ? bill.bill_value : 0,
        payment_method: bill.payment_mode,
        payment_status: bill.payment_mode === "cash" ? "paid" : "credit",
        status: "confirmed" as const,
        automation_source: "marg_legacy_import",
        automation_payload: { legacy: true, source: "REPORT_7" },
      };
      const { data: order, error: oErr } = await supabase
        .from("sales_orders")
        .insert(orderInsert)
        .select("id")
        .single();
      if (oErr || !order) {
        result.billsFailed++;
        result.errors.push(`${bill.invoice_number}: ${oErr?.message ?? "insert failed"}`);
        done++;
        onProgress?.(done, bills.length);
        continue;
      }
      existingInvoices.add(bill.invoice_number);

      const itemPayloads: Array<Record<string, unknown>> = [];
      for (const r of resolvedItems) {
        const batchNo = r.item.batch_number || "LEGACY";
        const batchId = await getOrCreateBatch(
          r.product.id,
          opts.companyId,
          batchNo,
          r.item.expiry,
          r.item.rate,
          batchCache,
        );
        if (!batchId) continue;
        const qty = Math.max(1, r.qty);
        itemPayloads.push({
          sales_order_id: order.id,
          company_id: opts.companyId,
          product_id: r.product.id,
          batch_id: batchId,
          quantity: qty,
          unit_price: r.item.rate,
          gst_percentage: 0,
          discount_percentage: 0,
          total_price: r.item.rate * qty,
        });
      }

      if (itemPayloads.length > 0) {
        const { error: iErr } = await supabase.from("sales_order_items").insert(itemPayloads);
        if (iErr) {
          result.errors.push(`${bill.invoice_number} items: ${iErr.message}`);
        } else {
          result.itemsInserted += itemPayloads.length;
        }
      }
      result.billsInserted++;
    } catch (err) {
      result.billsFailed++;
      result.errors.push(`${bill.invoice_number}: ${err instanceof Error ? err.message : String(err)}`);
    }
    done++;
    if (done % BATCH_SIZE === 0) onProgress?.(done, bills.length);
  }
  onProgress?.(bills.length, bills.length);

  result.customersCreated = customerCounters.created;
  result.unmatchedProducts = [...unmatched.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);
  return result;
}

export function unmatchedToCsv(items: SalesImportResult["unmatchedProducts"]): string {
  const lines = ["product_name,occurrences"];
  for (const r of items) lines.push(`"${r.name.replace(/"/g, '""')}",${r.count}`);
  return lines.join("\n");
}
