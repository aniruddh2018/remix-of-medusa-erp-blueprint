/**
 * Pack / conversion inference from a MARG-style product name.
 *
 * Handles common name suffixes such as:
 *   "BACLOF 10MG TAB 1*15"       → strip of 15 tablets  (factor 15)
 *   "PARACETAMOL 500 TAB 10*10"  → 10 strips × 10 tabs  (factor 10)
 *   "AZEE 500 TAB 3*1"           → strip of 3 tablets   (factor 3)
 *   "CALCIUM POWDER 1*15 GM"     → 15gm pouch, sold loose by gram (loose)
 *   "COUGH SYRUP 100ML 1*1"      → single bottle (factor 1)
 *
 * The convention: when we see  A*B  in the name, the number that is NOT 1 is the
 * pack factor (how many base units are inside one secondary/strip unit). If a
 * measurement unit (GM/ML/MG/L/KG) follows the pair, the product is a LOOSE
 * item — the numeric factor becomes the size of one saleable unit, so the
 * conversion is 1 (there is no strip layer to expand).
 */

export interface PackInfo {
  factor: number;               // conversion factor (base units per secondary unit)
  loose: boolean;               // true when the pack is a weight/volume measure sold loose
  measureUnit?: string;         // GM / ML / MG / L / KG when loose === true
}

const MEASURE = /(GM|ML|MG|L|KG|LTR|GRM)/;

/**
 * Extract pack info from the product name suffix.
 * Returns null when no A*B pattern is present.
 */
export function extractPackFromName(name: string): PackInfo | null {
  if (!name) return null;
  const upper = name.toUpperCase();

  // Match A*B or AxB (with optional spaces) optionally followed by a measurement unit.
  //   groups: [1]=A [2]=B [3]=optional measure
  const m = upper.match(/(\d+)\s*[*xX]\s*(\d+)\s*(GM|ML|MG|L|KG|LTR|GRM)?\b/);
  if (!m) return null;

  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  const measure = m[3];

  if (measure) {
    // "1*15 GM" style — the numeric part describes the size of a single unit
    // sold loose. There is no strip layer.
    return { factor: 1, loose: true, measureUnit: measure };
  }

  // Neither side is a measure — one of them is the pack factor.
  //   1*15  → 15   (1 strip of 15)
  //   15*1  → 15   (strip of 15, 1 strip)
  //   10*10 → 10   (10 strips × 10 tabs per strip)
  //   3*1   → 3
  let factor = 1;
  if (a === 1 && b > 1) factor = b;
  else if (b === 1 && a > 1) factor = a;
  else factor = b || a || 1;  // both >1: MARG convention → second number is per-strip

  return { factor, loose: false };
}

/**
 * Convenience — legacy callers that only need the numeric factor.
 * Returns null when no pattern matched so callers can fall back.
 */
export function packFactorFromName(name: string): number | null {
  const info = extractPackFromName(name);
  return info ? info.factor : null;
}
