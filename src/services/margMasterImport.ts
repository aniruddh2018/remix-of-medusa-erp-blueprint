import { supabase } from "@/integrations/supabase/client";
import { extractPackFromName } from "./packInference";
import { detectForm } from "./margPurchaseImport";

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

/** Build a deterministic fingerprint per product to detect duplicates within a company. */
const fingerprintOf = (r: MargMasterRow): string => {
  const name = (str(r.clean_name) || str(r.original_name)).toUpperCase();
  return [name, str(r.strength).toUpperCase(), str(r.manufacturer).toUpperCase()].join("|");
};

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

  // 1. Pre-fetch existing fingerprints for this company to skip duplicates fast.
  const existing = new Set<string>();
  {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("products")
        .select("name,strength,manufacturer")
        .eq("company_id", companyId)
        .range(from, from + PAGE - 1);
      if (error) {
        result.errors.push(`Preload existing products failed: ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;
      for (const p of data) {
        existing.add(
          [
            String(p.name ?? "").toUpperCase(),
            String(p.strength ?? "").toUpperCase(),
            String(p.manufacturer ?? "").toUpperCase(),
          ].join("|"),
        );
      }
      if (data.length < PAGE) break;
      from += PAGE;
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
  for (const r of rows) {
    const name = str(r.clean_name) || str(r.original_name);
    if (!name) {
      result.failed++;
      continue;
    }
    const mrp = num(r.mrp);
    if (mrp <= 0) {
      result.failed++;
      result.errors.push(`Skipped "${name}": MRP is 0`);
      continue;
    }

    const fp = fingerprintOf(r);
    if (existing.has(fp)) {
      result.skipped++;
      continue;
    }
    existing.add(fp); // avoid intra-batch dupes too

    // Infer pack / form when the sheet lacks explicit values so callers who
    // import a plain product list (name only) still get correct units + conversions.
    const packInfo = extractPackFromName(name);
    const detected = detectForm(name, "", str(r.base_unit) || null);

    let baseUnit = str(r.base_unit).toUpperCase();
    let secUnit = str(r.secondary_unit).toUpperCase();
    let conv = num(r.conversion);
    let form = str(r.form);

    if (packInfo?.loose && packInfo.measureUnit) {
      // "1*15 GM" style — sold loose by the measured unit, no strip layer.
      if (!baseUnit) baseUnit = packInfo.measureUnit;
      if (!secUnit) secUnit = packInfo.measureUnit;
      if (!conv) conv = 1;
    } else if (packInfo && !packInfo.loose) {
      if (!conv) conv = packInfo.factor;
    }

    if (!baseUnit) baseUnit = detected.baseUnit;
    if (!secUnit) secUnit = detected.secondaryUnit;
    if (!form) form = detected.form;
    if (!baseUnit) baseUnit = "PCS";

    const payload: ProductInsert = {
      company_id: companyId,
      name,
      brand: name,
      manufacturer: str(r.manufacturer) || "Unknown",
      generic_name: str(r.composition) || null,
      composition: str(r.composition) || null,
      strength: str(r.strength) || null,
      form: form || null,
      unit: baseUnit,
      base_unit: baseUnit,
      mrp,
      sale_price: mrp,
      purchase_price: num(r.rate, mrp),
      gst_percentage: num(r.gst_percent),
      drug_schedule: "none",
      batch_tracking_enabled: true,
      expiry_required: true,
      is_active: true,
    };

    const convRow =
      secUnit && conv > 1 && secUnit !== baseUnit
        ? { from: secUnit, to: baseUnit, factor: conv }
        : null;

    pending.push({ payload, conv: convRow });
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
