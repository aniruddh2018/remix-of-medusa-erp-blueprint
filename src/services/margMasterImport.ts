import { supabase } from "@/integrations/supabase/client";
import { extractPackFromName } from "./packInference";
import { detectForm, normalizeUnits } from "./margPurchaseImport";

/**
 * Row shape produced by the merged MARG master CSV
 * (Book2 + REPORT_1-2 → product_master_merged_v3.csv).
 *
 * The conversion rule encoded by this importer:
 *   1 <secondary_unit> = <conversion> <base_unit>
 *
 * Example:  base_unit=TAB, secondary_unit=STRIP, conversion=10
 *           → 1 STRIP = 10 TAB
 */
export interface MargMasterRow {
  clean_name?: string;
  original_name?: string;
  manufacturer?: string;
  composition?: string;
  form?: string;
  strength?: string;
  base_unit?: string;
  secondary_unit?: string;
  conversion?: string | number;
  mrp?: string | number;
  rate?: string | number;
  gst_percent?: string | number;
}

export interface MargMasterImportResult {
  totalRows: number;
  inserted: number;
  skipped: number; // duplicates
  failed: number;
  conversionsInserted: number;
  errors: string[];
}

type ProgressFn = (done: number, total: number) => void;

const BATCH_SIZE = 200;

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

/** Normalize a product name for dedup: uppercase + collapse whitespace + trim. */
const normName = (s: string): string => s.trim().toUpperCase().replace(/\s+/g, " ");

/** Fingerprint = normalized name only. Strength / manufacturer often diverge
 *  between the master sheet and rows created by stock/purchase imports; using
 *  them as part of the key causes re-imports to create duplicate products. */
const fingerprintOf = (r: MargMasterRow): string =>
  normName(str(r.clean_name) || str(r.original_name));

type ExistingProduct = { id: string; form: string | null; base_unit: string | null };

export async function importMargMasterRows(
  rows: MargMasterRow[],
  companyId: string,
  onProgress?: ProgressFn,
): Promise<MargMasterImportResult> {
  const result: MargMasterImportResult = {
    totalRows: rows.length,
    inserted: 0,
    skipped: 0,
    failed: 0,
    conversionsInserted: 0,
    errors: [],
  };

  // 1. Pre-fetch existing products for this company. On re-import we want to
  //    backfill missing form/base_unit and conversions on the EXISTING row
  //    rather than insert a duplicate.
  const existing = new Map<string, ExistingProduct>();
  {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,form,base_unit")
        .eq("company_id", companyId)
        .range(from, from + PAGE - 1);
      if (error) {
        result.errors.push(`Preload existing products failed: ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;
      for (const p of data) {
        existing.set(normName(String(p.name ?? "")), {
          id: p.id as string,
          form: (p.form as string | null) ?? null,
          base_unit: (p.base_unit as string | null) ?? null,
        });
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  // Preload conversion pairs to avoid inserting duplicates during backfill.
  const existingConv = new Set<string>();
  {
    const ids = Array.from(existing.values()).map((e) => e.id);
    for (let i = 0; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500);
      const { data } = await supabase
        .from("product_conversions")
        .select("product_id,from_unit,to_unit")
        .in("product_id", slice);
      data?.forEach((c) =>
        existingConv.add(
          `${c.product_id}|${String(c.from_unit).toUpperCase()}|${String(c.to_unit).toUpperCase()}`,
        ),
      );
    }
  }

  // 2. Build insert payloads (skip duplicates + invalid rows).
  type ProductInsert = {
    company_id: string;
    name: string;
    brand: string;
    manufacturer: string;
    generic_name: string | null;
    composition: string | null;
    strength: string | null;
    form: string | null;
    unit: string;
    base_unit: string;
    mrp: number;
    sale_price: number;
    purchase_price: number;
    gst_percentage: number;
    drug_schedule: "none";
    batch_tracking_enabled: boolean;
    expiry_required: boolean;
    is_active: boolean;
  };
  type ConversionInsert = {
    company_id: string;
    product_id: string;
    from_unit: string;
    to_unit: string;
    conversion_factor: number;
  };
  type Pending = { payload: ProductInsert; conv: { from: string; to: string; factor: number } | null };
  const pending: Pending[] = [];
  // Products that already exist but need form / base_unit / conversion filled in.
  const backfillProducts: Array<{ id: string; form: string | null; base_unit: string }> = [];
  const backfillConv: ConversionInsert[] = [];
  const seenThisRun = new Set<string>();

  for (const r of rows) {
    const rawName = str(r.clean_name) || str(r.original_name);
    if (!rawName) {
      result.failed++;
      continue;
    }
    const mrp = num(r.mrp);
    if (mrp <= 0) {
      result.failed++;
      result.errors.push(`Skipped "${rawName}": MRP is 0`);
      continue;
    }

    const fp = fingerprintOf(r);
    if (seenThisRun.has(fp)) {
      result.skipped++;
      continue;
    }
    seenThisRun.add(fp);

    // Infer pack / form when the sheet lacks explicit values.
    const packInfo = extractPackFromName(rawName);
    const detected = detectForm(rawName, "", str(r.base_unit) || null);

    let conv = num(r.conversion);
    const form = str(r.form) || detected.form;

    // Resolve base + secondary units.
    let baseUnit: string;
    let secUnit: string;
    if (packInfo?.loose && packInfo.measureUnit) {
      baseUnit = str(r.base_unit).toUpperCase() || packInfo.measureUnit;
      secUnit = str(r.secondary_unit).toUpperCase() || packInfo.measureUnit;
      if (!conv) conv = 1;
    } else {
      // For tablet/capsule/etc., FORCE atomic base unit — MARG sheets often
      // put "STRIP" in the base column which reverses conversion direction.
      const n = normalizeUnits(form, str(r.base_unit), str(r.secondary_unit), detected);
      baseUnit = n.baseUnit;
      secUnit = n.secondaryUnit;
      if (packInfo && !packInfo.loose && !conv) conv = packInfo.factor;
    }
    if (!baseUnit) baseUnit = "PCS";

    // Strict default for tablets / capsules — MARG ships 10 per strip when the
    // name gives no explicit factor. Prevents "1 STRIP = 1 TAB" garbage rows.
    if (conv <= 1 && (form === "TABLET" || form === "CAPSULE") && secUnit !== baseUnit) {
      conv = 10;
    }

    // MARG master files list MRP and rate per PACK (strip / bottle / tube).
    // Convert to per-unit price so the product's unit_price reflects one base unit.
    const perUnitMRP = conv > 1 ? Math.round((mrp / conv) * 100) / 100 : mrp;
    const perUnitRate = conv > 1
      ? Math.round((num(r.rate, mrp) / conv) * 100) / 100
      : num(r.rate, mrp);

    const convRow =
      secUnit && conv > 1 && secUnit !== baseUnit
        ? { from: secUnit, to: baseUnit, factor: conv }
        : null;

    // ------- Existing product path: backfill instead of inserting a duplicate.
    const existRow = existing.get(fp);
    if (existRow) {
      result.skipped++;
      // Also correct a previously wrong base_unit (STRIP/BOX/PACK/BOTTLE/VIAL for a
      // tablet-like form) so downstream conversions read correctly.
      const NON_ATOMIC = /^(STRIP|BOX|PACK|CTN|CARTON|CASE|BOTTLE|VIAL|AMP|TUBE|SACHET)$/i;
      const wrongBase = !!existRow.base_unit
        && NON_ATOMIC.test(existRow.base_unit)
        && ["TABLET", "CAPSULE", "INJECTION", "SYRUP", "CREAM", "POWDER"].includes(form);
      const needForm = !existRow.form && !!form;
      const needBase = (!existRow.base_unit || wrongBase) && !!baseUnit;
      if (needForm || needBase) {
        backfillProducts.push({
          id: existRow.id,
          form: needForm ? form : existRow.form,
          base_unit: needBase ? baseUnit : (existRow.base_unit ?? baseUnit),
        });
        existRow.form = needForm ? form : existRow.form;
        existRow.base_unit = needBase ? baseUnit : existRow.base_unit;
      }
      if (convRow) {
        const key = `${existRow.id}|${convRow.from}|${convRow.to}`;
        if (!existingConv.has(key)) {
          backfillConv.push({
            company_id: companyId,
            product_id: existRow.id,
            from_unit: convRow.from,
            to_unit: convRow.to,
            conversion_factor: convRow.factor,
          });
          existingConv.add(key);
        }
      }
      continue;
    }

    const payload: ProductInsert = {
      company_id: companyId,
      name: rawName,
      brand: rawName,
      manufacturer: str(r.manufacturer) || "Unknown",
      generic_name: str(r.composition) || null,
      composition: str(r.composition) || null,
      strength: str(r.strength) || null,
      form: form || null,
      unit: baseUnit,
      base_unit: baseUnit,
      mrp: perUnitMRP,
      sale_price: perUnitMRP,
      purchase_price: perUnitRate,
      gst_percentage: num(r.gst_percent),
      drug_schedule: "none",
      batch_tracking_enabled: true,
      expiry_required: true,
      is_active: true,
    };

    pending.push({ payload, conv: convRow });
  }

  // Flush backfill updates + conversion inserts for existing products.
  for (const b of backfillProducts) {
    const { error } = await supabase
      .from("products")
      .update({ form: b.form, base_unit: b.base_unit, unit: b.base_unit })
      .eq("id", b.id);
    if (error) result.errors.push(`Backfill ${b.id}: ${error.message}`);
  }
  if (backfillConv.length > 0) {
    for (let i = 0; i < backfillConv.length; i += 500) {
      const slice = backfillConv.slice(i, i + 500);
      const { error } = await supabase.from("product_conversions").insert(slice);
      if (error) result.errors.push(`Backfill conversions: ${error.message}`);
      else result.conversionsInserted += slice.length;
    }
  }


  // 3. Insert in batches; capture returned ids to insert conversions in lockstep.
  let done = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const slice = pending.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("products")
      .insert(slice.map((p) => p.payload))
      .select("id,name,strength,manufacturer");

    if (error) {
      // Fallback: per-row insert so a single bad row does not poison the batch.
      for (const item of slice) {
        const { data: one, error: e1 } = await supabase
          .from("products")
          .insert(item.payload)
          .select("id")
          .single();
        if (e1 || !one) {
          result.failed++;
          result.errors.push(`${String(item.payload.name)}: ${e1?.message ?? "insert failed"}`);
        } else {
          result.inserted++;
          if (item.conv) {
            const { error: ce } = await supabase.from("product_conversions").insert({
              company_id: companyId,
              product_id: one.id,
              from_unit: item.conv.from,
              to_unit: item.conv.to,
              conversion_factor: item.conv.factor,
            });
            if (!ce) result.conversionsInserted++;
          }
        }
      }
    } else if (data) {
      result.inserted += data.length;
      // Match returned rows back to pending entries by (name,strength,manufacturer).
      const byKey = new Map<string, string>();
      for (const d of data) {
        byKey.set(
          [
            String(d.name ?? "").toUpperCase(),
            String(d.strength ?? "").toUpperCase(),
            String(d.manufacturer ?? "").toUpperCase(),
          ].join("|"),
          d.id as string,
        );
      }
      const convPayload: ConversionInsert[] = [];
      for (const item of slice) {
        if (!item.conv) continue;
        const k = [
          String(item.payload.name ?? "").toUpperCase(),
          String(item.payload.strength ?? "").toUpperCase(),
          String(item.payload.manufacturer ?? "").toUpperCase(),
        ].join("|");
        const pid = byKey.get(k);
        if (pid) {
          convPayload.push({
            company_id: companyId,
            product_id: pid,
            from_unit: item.conv.from,
            to_unit: item.conv.to,
            conversion_factor: item.conv.factor,
          });
        }
      }
      if (convPayload.length > 0) {
        const { error: ce } = await supabase.from("product_conversions").insert(convPayload);
        if (ce) result.errors.push(`Conversions batch failed: ${ce.message}`);
        else result.conversionsInserted += convPayload.length;
      }
    }

    done += slice.length;
    onProgress?.(done, pending.length);
  }

  return result;
}
