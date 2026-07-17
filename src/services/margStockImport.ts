import { supabase } from "@/integrations/supabase/client";
import type { ParsedStockRow } from "./margStockParse";

/**
 * MARG Stock Importer — batch-aware.
 *
 * For DETAILED format (one row per real batch), each row becomes an
 * inventory_batches record with proper batch_number, expiry, mfg date,
 * supplier link, received date, MRP and purchase price.
 *
 * For LEGACY format (aggregated per product) it falls back to a single
 * synthetic "STOCK-OPENING-YYYYMMDD" batch per product, matching the
 * previous behaviour.
 */

export interface StockImportOptions {
  companyId: string;
  /** Current/active FY id — batches are stamped with this. Stock import is only meaningful in the active FY. */
  financialYearId?: string | null;
  /** Zero out all existing batches for matched products before writing new ones. */
  overrideExisting?: boolean;
  /** Refresh product mrp / sale_price / purchase_price from the file. */
  updateProductPrices?: boolean;
  /** Fallback date used when a row has no received/invoice date. */
  asOfDate?: string;
}

export interface StockImportResult {
  totalRows: number;
  productsMatched: number;
  productsSkippedNoMatch: number;
  batchesOpened: number;
  batchesUpdated: number;
  batchesZeroed: number;
  productsUpdated: number;
  suppliersLinked: number;
  unmatched: { code: string; name: string }[];
  errors: string[];
}

type Progress = (done: number, total: number) => void;
const UPPER = (s: string) => (s ?? "").toUpperCase().trim();
const OPENING_PREFIX = "STOCK-OPENING-";

interface ProductLite {
  id: string;
  name: string;
  brand: string | null;
  pack_size: string | null;
  base_unit: string | null;
}

async function preloadProducts(companyId: string) {
  const map = new Map<string, ProductLite>();
  let from = 0; const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("products").select("id,name,brand,pack_size,base_unit")
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
  let from = 0; const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("suppliers").select("id,name")
      .eq("company_id", companyId)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const s of data) map.set(UPPER(s.name), s.id as string);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

function inferConversion(packSize: string | null | undefined, baseUnit: string | null | undefined): number {
  const p = (packSize ?? "").trim();
  const m1 = p.match(/(\d+)\s*\*\s*(\d+)/);
  if (m1) return parseInt(m1[2], 10) || 1;
  const m2 = p.match(/^(\d+)'?S$/i);
  if (m2) return parseInt(m2[1], 10) || 1;
  const m3 = p.match(/^(\d+)$/);
  if (m3) return parseInt(m3[1], 10) || 1;
  if (/TAB|CAP/i.test(baseUnit ?? "")) return 10;
  return 1;
}

/** Try to infer pack size from the product name suffix (e.g. "1*10", "1*15"). */
function inferPackFromName(name: string): number | null {
  const m = name.match(/(\d+)\s*\*\s*(\d+)/);
  if (m) return parseInt(m[2], 10) || null;
  return null;
}

/** MARG qty like 29.7 with pack 10 → 29 strips + 7 loose. Uses fractional digits. */
function splitQty(raw: number, conv: number): { strips: number; loose: number } {
  if (!Number.isFinite(raw)) return { strips: 0, loose: 0 };
  const negative = raw < 0;
  const abs = Math.abs(raw);
  const strips = Math.floor(abs);
  const decStr = abs.toString().split(".")[1] ?? "";
  const packDigits = String(Math.max(conv, 1)).length; // pack 10 -> 1 digit, 100 -> 2
  const takeDigits = Math.max(1, packDigits - 1);
  const decNum = decStr ? parseInt(decStr.padEnd(takeDigits, "0").slice(0, takeDigits), 10) : 0;
  const s = negative ? -strips : strips;
  const l = negative ? -decNum : decNum;
  return { strips: s, loose: Number.isFinite(l) ? l : 0 };
}

/**
 * Classify the "Unit" column from a MARG stock sheet into the storage semantics
 * our inventory uses. Different rows can be written in different units even for
 * the same product — TAB/CAP are usually STRIPS, syrups/injections/creams are
 * PCS (single bottle/vial/tube), and BOX packs multiple strips.
 */
type UnitKind = "STRIP" | "LOOSE" | "BOX" | "PCS";
function classifyUnit(unit: string, productName: string): UnitKind {
  const u = (unit || "").toUpperCase().replace(/[.\s]/g, "");
  const n = (productName || "").toUpperCase();
  if (!u) {
    // No unit column value — infer from product form
    if (/\bTAB|\bCAP/.test(n)) return "STRIP";
    return "PCS";
  }
  if (/^STR|STRIP|BLIST|BLST/.test(u)) return "STRIP";
  if (/^BOX|CTN|CARTON|PKT|PACK/.test(u)) return "BOX";
  if (/^TAB|^CAP|^PCS?$|^NOS?$|^PC$|^EA|LOOSE|UNIT/.test(u)) {
    // "PCS"/"NOS" on a tablet product still means loose tablets in MARG.
    // For syrups/injections/creams "PCS" means one bottle/vial (base unit).
    if (/\bTAB|\bCAP/.test(n)) return "LOOSE";
    return "PCS";
  }
  if (/BTL|BOTTLE|VIAL|AMP|TUBE|JAR|SACHET|ML$|GM$|GRM|LTR|KG$/.test(u)) return "PCS";
  // Fallback: TAB/CAP products default to strip semantics, everything else PCS.
  if (/\bTAB|\bCAP/.test(n)) return "STRIP";
  return "PCS";
}

/**
 * Convert a MARG stock row's raw qty into (strips, loose) taking the row's
 * declared unit into account.
 *   STRIP  → 29.7 = 29 strips + 7 loose (existing decimal-split behaviour)
 *   LOOSE  → 47   = 4 strips + 7 loose  (pure loose tablets)
 *   BOX    → 3    = 3 * conv strips     (assumes 1 box = pack of strips)
 *   PCS    → 12   = 12 strips (base unit; loose = 0)
 */
function interpretQty(
  raw: number,
  conv: number,
  kind: UnitKind,
): { strips: number; loose: number } {
  if (!Number.isFinite(raw) || raw === 0) return { strips: 0, loose: 0 };
  switch (kind) {
    case "STRIP":
      return splitQty(raw, conv);
    case "LOOSE": {
      const total = Math.trunc(raw);
      const c = Math.max(conv, 1);
      return { strips: Math.trunc(total / c), loose: total % c };
    }
    case "BOX": {
      const c = Math.max(conv, 1);
      return { strips: Math.trunc(raw) * c, loose: 0 };
    }
    case "PCS":
    default:
      return { strips: Math.trunc(raw), loose: 0 };
  }
}

/** Generate a stable synthetic batch number when the file has none. */
function fallbackBatchNo(code: string, receivedDate: string | null | undefined, idx: number): string {
  const d = (receivedDate ?? "").replace(/-/g, "");
  return `NB-${code}-${d || "NA"}-${idx}`;
}

export async function importMargStock(
  rows: ParsedStockRow[],
  opts: StockImportOptions,
  onProgress?: Progress,
): Promise<StockImportResult> {
  const result: StockImportResult = {
    totalRows: rows.length,
    productsMatched: 0,
    productsSkippedNoMatch: 0,
    batchesOpened: 0,
    batchesUpdated: 0,
    batchesZeroed: 0,
    productsUpdated: 0,
    suppliersLinked: 0,
    unmatched: [],
    errors: [],
  };
  const override = opts.overrideExisting ?? true;
  const updatePrices = opts.updateProductPrices ?? true;
  const asOf = opts.asOfDate ?? new Date().toISOString().slice(0, 10);

  const [products, suppliers] = await Promise.all([
    preloadProducts(opts.companyId),
    preloadSuppliers(opts.companyId),
  ]);

  // Track products we've already zeroed (once per import, not per row).
  const zeroedProducts = new Set<string>();
  // Track products we've already price-updated (once per product with latest row).
  const pricedProducts = new Set<string>();
  // Track occurrences of same (product, batch) to disambiguate blank batch numbers.
  const rowIdxByKey = new Map<string, number>();

  let done = 0;

  for (const row of rows) {
    try {
      const p = products.get(UPPER(row.name));
      if (!p) {
        result.productsSkippedNoMatch++;
        if (result.unmatched.length < 500) result.unmatched.push({ code: row.code, name: row.name });
        done++; if (done % 25 === 0) onProgress?.(done, rows.length); continue;
      }
      result.productsMatched++;

      // Zero out existing batches once per matched product when override is on.
      if (override && !zeroedProducts.has(p.id)) {
        const { data: others } = await supabase.from("inventory_batches")
          .select("id").eq("product_id", p.id).eq("company_id", opts.companyId);
        if (others && others.length > 0) {
          await supabase.from("inventory_batches")
            .update({ quantity: 0, loose_quantity: 0 })
            .in("id", others.map((o) => o.id));
          result.batchesZeroed += others.length;
        }
        zeroedProducts.add(p.id);
      }

      const conv = inferPackFromName(row.name) ?? inferConversion(p.pack_size, p.base_unit);
      const { strips, loose } = splitQty(row.qtyRaw, conv);

      // Build the batch number. If MARG gives none, fall back to a synthetic
      // one keyed by received date + row index so multiple no-batch rows for
      // the same product don't collide.
      const idxKey = `${p.id}|${row.batch_number || "NOBATCH"}|${row.received_date ?? ""}`;
      const seen = rowIdxByKey.get(idxKey) ?? 0;
      rowIdxByKey.set(idxKey, seen + 1);
      const batchNo = row.batch_number && row.batch_number.trim()
        ? (seen === 0 ? row.batch_number.trim() : `${row.batch_number.trim()}-${seen + 1}`)
        : fallbackBatchNo(row.code, row.received_date ?? asOf, seen);

      const supplierId = row.supplier_name ? suppliers.get(UPPER(row.supplier_name)) ?? null : null;
      if (supplierId) result.suppliersLinked++;

      const patch = {
        company_id: opts.companyId,
        product_id: p.id,
        batch_number: batchNo,
        quantity: strips,
        loose_quantity: loose,
        mrp: row.mrp || 0,
        purchase_price: row.purchase_price || row.cost_price || 0,
        expiry_date: row.expiry_date,
        manufacturing_date: row.mfg_date,
        received_date: row.received_date ?? asOf,
        supplier_id: supplierId,
        pack_size: conv > 1 ? conv : null,
        financial_year_id: opts.financialYearId ?? null,
      };

      const { data: existing } = await supabase.from("inventory_batches")
        .select("id").eq("product_id", p.id).eq("company_id", opts.companyId)
        .eq("batch_number", batchNo).maybeSingle();

      if (existing?.id) {
        await supabase.from("inventory_batches").update(patch).eq("id", existing.id);
        result.batchesUpdated++;
      } else {
        const { error: bErr } = await supabase.from("inventory_batches").insert(patch);
        if (bErr) {
          result.errors.push(`${row.name} [${batchNo}]: ${bErr.message}`);
          done++; continue;
        }
        result.batchesOpened++;
      }

      if (updatePrices && !pricedProducts.has(p.id)) {
        const priceUpdate: Record<string, number> = {};
        if (row.mrp) priceUpdate.mrp = row.mrp;
        if (row.sale_price) priceUpdate.sale_price = row.sale_price;
        if (row.purchase_price) priceUpdate.purchase_price = row.purchase_price;
        if (Object.keys(priceUpdate).length > 0) {
          await supabase.from("products").update(priceUpdate).eq("id", p.id);
          result.productsUpdated++;
        }
        pricedProducts.add(p.id);
      }
    } catch (err) {
      result.errors.push(`${row.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    done++;
    if (done % 25 === 0) onProgress?.(done, rows.length);
  }
  onProgress?.(rows.length, rows.length);
  return result;
}

export function stockUnmatchedToCsv(items: StockImportResult["unmatched"]): string {
  const lines = ["code,name"];
  for (const r of items) lines.push(`"${r.code}","${r.name.replace(/"/g, '""')}"`);
  return lines.join("\n");
}

/** Legacy opening-batch prefix kept for downstream callers/tests. */
export const STOCK_OPENING_PREFIX = OPENING_PREFIX;
