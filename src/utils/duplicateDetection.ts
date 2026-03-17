import type { Database } from "@/integrations/supabase/types";

type Product = Database["public"]["Tables"]["products"]["Row"];

export interface DuplicateGroup {
  /** Normalized key used for grouping */
  key: string;
  /** All products in this duplicate group */
  products: Product[];
  /** Confidence: "high" = exact normalized match, "medium" = fuzzy match */
  confidence: "high" | "medium";
}

/** Normalize a string for comparison: lowercase, collapse whitespace, strip common suffixes */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip common pharma packaging words for deeper matching */
function deepNormalize(str: string): string {
  const base = normalize(str);
  return base
    .replace(/\b(tab|tablet|tablets|cap|capsule|capsules|syp|syrup|inj|injection|drops|cream|gel|ointment|suspension|soln|solution)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Detect duplicate product groups from a list of active products */
export function detectDuplicates(products: Product[]): DuplicateGroup[] {
  const active = products.filter((p) => p.is_active);

  // Phase 1: Exact normalized name + manufacturer match
  const exactMap = new Map<string, Product[]>();
  for (const p of active) {
    const key = `${normalize(p.name)}||${normalize(p.manufacturer)}`;
    const arr = exactMap.get(key) || [];
    arr.push(p);
    exactMap.set(key, arr);
  }

  const highGroups: DuplicateGroup[] = [];
  const usedIds = new Set<string>();

  for (const [key, group] of exactMap) {
    if (group.length >= 2) {
      highGroups.push({ key, products: group, confidence: "high" });
      group.forEach((p) => usedIds.add(p.id));
    }
  }

  // Phase 2: Deep-normalized name + manufacturer (catches "Paracetamol Tab" vs "Paracetamol Tablet")
  const deepMap = new Map<string, Product[]>();
  for (const p of active) {
    if (usedIds.has(p.id)) continue;
    const key = `${deepNormalize(p.name)}||${normalize(p.manufacturer)}`;
    const arr = deepMap.get(key) || [];
    arr.push(p);
    deepMap.set(key, arr);
  }

  const mediumGroups: DuplicateGroup[] = [];
  for (const [key, group] of deepMap) {
    if (group.length >= 2) {
      mediumGroups.push({ key, products: group, confidence: "medium" });
    }
  }

  // Phase 3: Same generic_name + strength + manufacturer (if generic_name exists)
  const remainingIds = new Set(active.filter((p) => !usedIds.has(p.id) && !mediumGroups.some((g) => g.products.some((gp) => gp.id === p.id))).map((p) => p.id));
  const genericMap = new Map<string, Product[]>();
  for (const p of active) {
    if (!remainingIds.has(p.id)) continue;
    if (!p.generic_name) continue;
    const key = `gen:${normalize(p.generic_name)}||${normalize(p.strength || "")}||${normalize(p.manufacturer)}`;
    const arr = genericMap.get(key) || [];
    arr.push(p);
    genericMap.set(key, arr);
  }

  for (const [key, group] of genericMap) {
    if (group.length >= 2) {
      mediumGroups.push({ key, products: group, confidence: "medium" });
    }
  }

  return [...highGroups, ...mediumGroups];
}

/** Pick the best primary product from a group (most inventory references, oldest) */
export function suggestPrimary(group: Product[]): string {
  // Prefer the oldest product (first created)
  const sorted = [...group].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  return sorted[0].id;
}
