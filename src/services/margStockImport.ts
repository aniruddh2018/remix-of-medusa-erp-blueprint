import { supabase } from "@/integrations/supabase/client";
import type { ParsedStockRow } from "./margStockParse";

export interface StockImportOptions {
  companyId: string;
  overrideExisting?: boolean; // default true — zero out other batches for matched products
  updateProductPrices?: boolean; // default true — refresh mrp / sale_price / purchase_price
  asOfDate?: string; // ISO yyyy-mm-dd — used as received_date on the opening batch
}

export interface StockImportResult {
  totalRows: number;
  productsMatched: number;
  productsSkippedNoMatch: number;
  batchesOpened: number;
  batchesZeroed: number;
  productsUpdated: number;
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

/** MARG qty like 29.7 → 29 strips + 7 loose (out of conv=10). */
function splitQty(raw: number, conv: number): { strips: number; loose: number } {
  if (raw <= 0) return { strips: 0, loose: 0 };
  const strips = Math.floor(raw);
  const frac = raw - strips;
  const loose = Math.round(frac * (conv > 0 ? conv * 10 : 10) / 10 * (conv > 0 ? 1 : 1));
  // Simpler & robust: fractional digit interpreted as loose count out of pack.
  // 29.7 with conv 10 → loose 7. 0.21 with conv 100 → loose 21.
  const decStr = raw.toString().split(".")[1] ?? "";
  const decNum = decStr ? parseInt(decStr.padEnd(String(conv).length - 1, "0").slice(0, String(conv).length - 1), 10) : 0;
  return { strips, loose: Number.isFinite(decNum) ? decNum : loose };
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
    batchesZeroed: 0,
    productsUpdated: 0,
    unmatched: [],
    errors: [],
  };
  const override = opts.overrideExisting ?? true;
  const updatePrices = opts.updateProductPrices ?? true;
  const asOf = opts.asOfDate ?? new Date().toISOString().slice(0, 10);
  const openingBatchNo = `${OPENING_PREFIX}${asOf.replace(/-/g, "")}`;

  const products = await preloadProducts(opts.companyId);
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

      const conv = inferConversion(p.pack_size, p.base_unit);
      const { strips, loose } = splitQty(row.qtyRaw, conv);

      if (override) {
        const { data: others } = await supabase.from("inventory_batches")
          .select("id").eq("product_id", p.id).eq("company_id", opts.companyId)
          .neq("batch_number", openingBatchNo);
        if (others && others.length > 0) {
          await supabase.from("inventory_batches")
            .update({ quantity: 0, loose_quantity: 0 })
            .in("id", others.map(o => o.id));
          result.batchesZeroed += others.length;
        }
      }

      const { data: existing } = await supabase.from("inventory_batches")
        .select("id").eq("product_id", p.id).eq("company_id", opts.companyId)
        .eq("batch_number", openingBatchNo).maybeSingle();

      if (existing?.id) {
        await supabase.from("inventory_batches").update({
          quantity: strips, loose_quantity: loose,
          mrp: row.mrp || undefined,
          purchase_price: row.purchase_price || undefined,
        }).eq("id", existing.id);
      } else {
        const { error: bErr } = await supabase.from("inventory_batches").insert({
          company_id: opts.companyId,
          product_id: p.id,
          batch_number: openingBatchNo,
          quantity: strips,
          loose_quantity: loose,
          mrp: row.mrp || 0,
          purchase_price: row.purchase_price || 0,
          received_date: asOf,
        });
        if (bErr) {
          result.errors.push(`${row.name}: batch ${bErr.message}`);
          done++; continue;
        }
        result.batchesOpened++;
      }

      if (updatePrices) {
        const patch: Record<string, number> = {};
        if (row.mrp) patch.mrp = row.mrp;
        if (row.sale_price) patch.sale_price = row.sale_price;
        if (row.purchase_price) patch.purchase_price = row.purchase_price;
        if (Object.keys(patch).length > 0) {
          await supabase.from("products").update(patch).eq("id", p.id);
          result.productsUpdated++;
        }
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
