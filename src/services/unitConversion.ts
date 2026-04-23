/**
 * Unit Conversion Resolver
 *
 * Single source of truth for converting between units across Sales, Purchase,
 * and Inventory. Resolution order matches the DB RPC `resolve_conversion`:
 *   1. Batch override   (batch_conversions)
 *   2. Product mapping  (product_conversions)
 *   3. System fallback  (system_conversions: mg/g/ml/L/mcg)
 *
 * All factors are integers — no floating-point math is permitted in the
 * inventory path. Conversion to base units uses `Math.round` only at display
 * boundaries.
 */
import { supabase } from "@/integrations/supabase/client";

export type ResolutionPath = "identity" | "batch" | "product" | "system";

export interface ConversionResult {
  factor: number;
  path: ResolutionPath;
  reverse: boolean;
  /** base = from / factor when forward, base = from * factor when reverse */
  toBase: (qty: number) => number;
  fromBase: (baseQty: number) => number;
}

interface CacheEntry {
  factor: number;
  path: ResolutionPath;
  reverse: boolean;
}

// Module-level cache — keyed by company|product|batch|from|to.
// Cleared via `clearConversionCache()` after relevant mutations.
const cache = new Map<string, CacheEntry>();

const cacheKey = (
  companyId: string,
  productId: string | null,
  batchId: string | null,
  from: string,
  to: string,
) => `${companyId}|${productId ?? ""}|${batchId ?? ""}|${from.toLowerCase()}|${to.toLowerCase()}`;

export function clearConversionCache() {
  cache.clear();
}

/**
 * Resolve a conversion factor, hitting cache first then the DB RPC.
 * Throws if no path is found in any layer.
 */
export async function resolveConversion(params: {
  companyId: string;
  productId: string | null;
  batchId: string | null;
  fromUnit: string;
  toUnit: string;
}): Promise<ConversionResult> {
  const { companyId, productId, batchId, fromUnit, toUnit } = params;

  if (!fromUnit || !toUnit) {
    throw new Error("from and to units are required");
  }

  // Identity short-circuit
  if (fromUnit.toLowerCase() === toUnit.toLowerCase()) {
    return makeResult(1, "identity", false);
  }

  const key = cacheKey(companyId, productId, batchId, fromUnit, toUnit);
  const cached = cache.get(key);
  if (cached) return makeResult(cached.factor, cached.path, cached.reverse);

  const { data, error } = await supabase.rpc("resolve_conversion", {
    _company_id: companyId,
    _product_id: productId,
    _batch_id: batchId,
    _from_unit: fromUnit,
    _to_unit: toUnit,
  });

  if (error) throw error;
  const j = data as { factor: number; path: ResolutionPath; reverse?: boolean };
  cache.set(key, { factor: j.factor, path: j.path, reverse: !!j.reverse });
  return makeResult(j.factor, j.path, !!j.reverse);
}

function makeResult(factor: number, path: ResolutionPath, reverse: boolean): ConversionResult {
  return {
    factor,
    path,
    reverse,
    /**
     * Convert quantity in "from" unit to base unit.
     * Forward (Strip→Tablet, factor=10): 2 strips → 20 tablets (qty * factor)
     * Reverse (Tablet→Strip, factor=10): 20 tablets → 2 strips (qty / factor)
     */
    toBase: (qty: number) => (reverse ? Math.round(qty / factor) : qty * factor),
    fromBase: (baseQty: number) => (reverse ? baseQty * factor : Math.round(baseQty / factor)),
  };
}

/**
 * Convenience: list all units that the given product can be sold in.
 * Includes the product's own base unit + every from_unit/to_unit referenced
 * in product_conversions and any batch_conversions.
 */
export async function listSellableUnits(params: {
  companyId: string;
  productId: string;
  baseUnit: string;
  batchId?: string | null;
}): Promise<string[]> {
  const { productId, baseUnit, batchId } = params;
  const units = new Set<string>([baseUnit.toLowerCase()]);

  const [{ data: prodRows }, { data: batchRows }] = await Promise.all([
    supabase
      .from("product_conversions")
      .select("from_unit, to_unit")
      .eq("product_id", productId)
      .eq("is_active", true),
    batchId
      ? supabase
          .from("batch_conversions")
          .select("from_unit, to_unit")
          .eq("batch_id", batchId)
      : Promise.resolve({ data: [] as Array<{ from_unit: string; to_unit: string }> }),
  ]);

  prodRows?.forEach((r) => {
    units.add(r.from_unit.toLowerCase());
    units.add(r.to_unit.toLowerCase());
  });
  batchRows?.forEach((r) => {
    units.add(r.from_unit.toLowerCase());
    units.add(r.to_unit.toLowerCase());
  });

  return Array.from(units);
}

/**
 * Validate that selling `qty` of `unit` is possible given a batch's mixed
 * stock (sealed packs + loose base units). Returns the base-unit quantity
 * required, or throws on insufficient/un-resolvable conversion.
 */
export async function computeStockImpact(params: {
  companyId: string;
  productId: string;
  batchId: string;
  unit: string;
  baseUnit: string;
  qty: number;
  packSize: number | null;
  sealedQty: number;
  looseQty: number;
}): Promise<{ baseQty: number; sealedAfter: number; looseAfter: number }> {
  const { companyId, productId, batchId, unit, baseUnit, qty, packSize, sealedQty, looseQty } = params;

  const conv = await resolveConversion({
    companyId,
    productId,
    batchId,
    fromUnit: unit,
    toUnit: baseUnit,
  });

  const baseQty = conv.toBase(qty);
  const totalAvailable = looseQty + sealedQty * (packSize ?? 1);
  if (baseQty > totalAvailable) {
    throw new Error(`Insufficient stock. Available ${totalAvailable} ${baseUnit}, need ${baseQty}.`);
  }

  // Mirror DB logic: take from loose first, then break sealed packs as needed.
  let need = baseQty;
  let loose = looseQty;
  let sealed = sealedQty;
  if (loose >= need) {
    loose -= need;
    need = 0;
  } else {
    need -= loose;
    loose = 0;
  }
  if (need > 0) {
    if (!packSize || packSize <= 0) {
      sealed -= need;
    } else {
      const broken = Math.ceil(need / packSize);
      sealed -= broken;
      loose = broken * packSize - need;
    }
  }
  return { baseQty, sealedAfter: sealed, looseAfter: loose };
}
