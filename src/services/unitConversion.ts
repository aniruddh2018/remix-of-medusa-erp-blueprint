/**
 * Unit Conversion Resolver
 *
 * Single source of truth for converting between units across Sales, Purchase,
 * and Inventory. Resolution order:
 *   1. Batch override   (batch_conversions)
 *   2. Product mapping  (product_conversions)
 *   3. System fallback  (system_conversions: mg/g/ml/L/mcg)
 *
 * Inventory quantities must always be persisted in the product's base unit.
 * Product/batch conversions may be multi-step, but every path must resolve
 * deterministically to the same base quantity.
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

export interface ConversionRow {
  from_unit: string;
  to_unit: string;
  conversion_factor: number;
}

export interface ConversionValidationResult {
  ok: boolean;
  errors: string[];
  factorsToBase: Record<string, number>;
}

interface Edge {
  from: string;
  to: string;
  factor: number;
  path: ResolutionPath;
  key: string;
}

// Module-level cache — keyed by company|product|batch|from|to.
// Cleared via `clearConversionCache()` after relevant mutations.
const cache = new Map<string, CacheEntry>();
const graphCache = new Map<string, Edge[]>();

const EPSILON = 1e-9;

const cacheKey = (
  companyId: string,
  productId: string | null,
  batchId: string | null,
  from: string,
  to: string,
) => `${companyId}|${productId ?? ""}|${batchId ?? ""}|${from.toLowerCase()}|${to.toLowerCase()}`;

export function clearConversionCache() {
  cache.clear();
  graphCache.clear();
}

/**
 * Resolve a conversion factor, hitting cache first then the local graph. The
 * graph supports multi-step product conversions (Box → Strip → Tablet), while
 * the DB RPC remains a direct-conversion fallback for system units.
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

  if (productId) {
    const graph = await loadConversionGraph({ companyId, productId, batchId });
    const resolved = resolveFromGraph(graph, fromUnit, toUnit);
    if (resolved) {
      cache.set(key, { factor: resolved.factor, path: resolved.path, reverse: false });
      return makeResult(resolved.factor, resolved.path, false);
    }
  }

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
  assertPositiveFactor(factor);
  return {
    factor,
    path,
    reverse,
    /**
     * Convert quantity in "from" unit to base unit.
     * Forward (Strip→Tablet, factor=10): 2 strips → 20 tablets (qty * factor)
     * Reverse (Tablet→Strip, factor=10): 20 tablets → 2 strips (qty / factor)
     */
    toBase: (qty: number) => roundQuantity(reverse ? qty / factor : qty * factor),
    fromBase: (baseQty: number) => roundQuantity(reverse ? baseQty * factor : baseQty / factor),
  };
}

function normalizeUnit(unit: string) {
  return unit.trim().toLowerCase();
}

function assertPositiveFactor(factor: number) {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error("Conversion factor must be greater than zero.");
  }
}

export function roundQuantity(value: number) {
  if (!Number.isFinite(value)) throw new Error("Invalid quantity.");
  return Number(value.toFixed(6));
}

async function loadConversionGraph(params: {
  companyId: string;
  productId: string;
  batchId: string | null;
}): Promise<Edge[]> {
  const { productId, batchId } = params;
  const key = `${params.companyId}|${productId}|${batchId ?? ""}`;
  const cached = graphCache.get(key);
  if (cached) return cached;

  const [{ data: productRows }, { data: batchRows }] = await Promise.all([
    supabase
      .from("product_conversions")
      .select("from_unit, to_unit, conversion_factor")
      .eq("product_id", productId)
      .eq("is_active", true),
    batchId
      ? supabase
          .from("batch_conversions")
          .select("from_unit, to_unit, conversion_factor")
          .eq("batch_id", batchId)
      : Promise.resolve({ data: [] as ConversionRow[] }),
  ]);

  const directed = new Map<string, Edge>();
  const addDirected = (row: ConversionRow, path: ResolutionPath) => {
    const from = normalizeUnit(row.from_unit);
    const to = normalizeUnit(row.to_unit);
    const factor = Number(row.conversion_factor);
    if (!from || !to || from === to) return;
    assertPositiveFactor(factor);
    directed.set(`${from}->${to}`, { from, to, factor, path, key: `${from}->${to}` });
  };

  (productRows as ConversionRow[] | null)?.forEach((row) => addDirected(row, "product"));
  // Batch rows intentionally overwrite matching product edges.
  (batchRows as ConversionRow[] | null)?.forEach((row) => addDirected(row, "batch"));

  const graph: Edge[] = [];
  directed.forEach((edge) => {
    graph.push(edge);
    graph.push({
      from: edge.to,
      to: edge.from,
      factor: 1 / edge.factor,
      path: edge.path,
      key: `${edge.to}->${edge.from}`,
    });
  });
  graphCache.set(key, graph);
  return graph;
}

function resolveFromGraph(graph: Edge[], fromUnit: string, toUnit: string): { factor: number; path: ResolutionPath } | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return { factor: 1, path: "identity" };

  const byFrom = new Map<string, Edge[]>();
  graph.forEach((edge) => byFrom.set(edge.from, [...(byFrom.get(edge.from) ?? []), edge]));

  const queue: Array<{ unit: string; factor: number; path: ResolutionPath; visited: Set<string> }> = [
    { unit: from, factor: 1, path: "identity", visited: new Set([from]) },
  ];
  const candidates: Array<{ factor: number; path: ResolutionPath }> = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of byFrom.get(current.unit) ?? []) {
      if (current.visited.has(edge.to)) continue;
      const factor = current.factor * edge.factor;
      const path: ResolutionPath = edge.path === "batch" || current.path === "batch"
        ? "batch"
        : edge.path === "product" || current.path === "product"
          ? "product"
          : edge.path;
      if (edge.to === to) {
        candidates.push({ factor, path });
      } else {
        queue.push({ unit: edge.to, factor, path, visited: new Set([...current.visited, edge.to]) });
      }
    }
  }

  if (candidates.length === 0) return null;
  const first = candidates[0];
  const mismatch = candidates.find((c) => Math.abs(c.factor - first.factor) > EPSILON);
  if (mismatch) {
    throw new Error(`Conversion mismatch: ${fromUnit} resolves to ${toUnit} with multiple factors.`);
  }
  return { factor: roundQuantity(first.factor), path: first.path };
}

export async function convertToBase(params: {
  companyId: string;
  productId: string;
  batchId?: string | null;
  unit: string;
  baseUnit: string;
  qty: number;
}): Promise<number> {
  const { companyId, productId, batchId = null, unit, baseUnit, qty } = params;
  if (!Number.isFinite(qty) || qty < 0) throw new Error("Quantity must be zero or greater.");
  const conversion = await resolveConversion({
    companyId,
    productId,
    batchId,
    fromUnit: unit,
    toUnit: baseUnit,
  });
  return conversion.toBase(qty);
}

export async function describeBaseConversion(params: {
  companyId: string | null | undefined;
  productId: string | null;
  batchId?: string | null;
  unit: string;
  baseUnit: string | null | undefined;
  qty: number;
}): Promise<string | null> {
  const { companyId, productId, batchId = null, unit, baseUnit, qty } = params;
  if (!companyId || !productId || !unit || !baseUnit || qty <= 0) return null;
  const baseQty = await convertToBase({
    companyId,
    productId,
    batchId,
    unit,
    baseUnit,
    qty,
  });
  return `${qty} ${normalizeUnit(unit)} = ${baseQty} ${normalizeUnit(baseUnit)}`;
}

export function validateConversionRows(rows: ConversionRow[], baseUnit: string): ConversionValidationResult {
  const errors: string[] = [];
  const directed = rows.map((row) => ({
    from: normalizeUnit(row.from_unit),
    to: normalizeUnit(row.to_unit),
    factor: Number(row.conversion_factor),
  }));
  const base = normalizeUnit(baseUnit);
  const seen = new Set<string>();

  directed.forEach((row) => {
    if (!row.from || !row.to) errors.push("Both From and To units are required.");
    if (row.from === row.to) errors.push(`Unit ${row.from} cannot convert to itself.`);
    if (!Number.isFinite(row.factor) || row.factor <= 0) errors.push(`Conversion ${row.from} → ${row.to} must be greater than zero.`);
    const key = `${row.from}->${row.to}`;
    if (seen.has(key)) errors.push(`Duplicate conversion: ${key}.`);
    seen.add(key);
  });

  const byFrom = new Map<string, typeof directed>();
  directed.forEach((row) => byFrom.set(row.from, [...(byFrom.get(row.from) ?? []), row]));

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const factorsToBase: Record<string, number> = { [base]: 1 };

  const resolve = (unit: string, stack: string[]): number[] => {
    if (unit === base) return [1];
    if (visiting.has(unit)) {
      errors.push(`Circular conversion detected: ${[...stack, unit].join(" → ")}.`);
      return [];
    }
    visiting.add(unit);
    const factors: number[] = [];
    for (const edge of byFrom.get(unit) ?? []) {
      for (const downstream of resolve(edge.to, [...stack, unit])) {
        factors.push(edge.factor * downstream);
      }
    }
    visiting.delete(unit);
    visited.add(unit);
    if (factors.length > 0) {
      const first = factors[0];
      const mismatch = factors.find((factor) => Math.abs(factor - first) > EPSILON);
      if (mismatch) {
        errors.push(`Conversion mismatch: ${unit} has conflicting paths to ${base}.`);
      }
      factorsToBase[unit] = roundQuantity(first);
    }
    return factors;
  };

  new Set(directed.flatMap((row) => [row.from, row.to, base])).forEach((unit) => {
    if (!visited.has(unit) && unit !== base) resolve(unit, []);
  });

  new Set(directed.map((row) => row.from)).forEach((unit) => {
    if (!factorsToBase[unit]) errors.push(`Missing conversion path from ${unit} to base unit ${base}.`);
  });

  return { ok: errors.length === 0, errors: Array.from(new Set(errors)), factorsToBase };
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
