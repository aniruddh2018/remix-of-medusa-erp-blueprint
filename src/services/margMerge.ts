/**
 * MARG Master Merger
 * ------------------
 * Takes the two raw MARG ERP exports and produces the same row shape
 * as the merged v3 CSV — directly in the browser, no Python needed.
 *
 *   File A:  Book2.xlsx          (manufacturer-grouped product master)
 *   File B:  REPORT_1-2.XLS      (composition/category-grouped product master)
 *
 * Both have the same columns:  SNo | ITEM | DESCRIPTION | RATE | M.R.P. | TAX%
 * with header rows where only column 0 is set — those mark the current
 * manufacturer (File A) or composition / category (File B).
 *
 * The merger reads both, attaches the active header to every item row,
 * then joins them on (ITEM + DESCRIPTION) so each product carries both
 * manufacturer and composition. Finally it parses name/description into
 * form, strength, pack and conversion using the same rules as v3.
 */

import * as XLSX from "xlsx";
import type { MargMasterRow } from "./margMasterImport";

type RawRow = (string | number | null | undefined)[];

interface ParsedItem {
  key: string; // ITEM|DESCRIPTION (upper-cased)
  item: string;
  description: string;
  rate: number;
  mrp: number;
  gst: number;
  header: string; // active manufacturer / composition header
}

const FORM_TOKENS = [
  "TAB", "TABS", "CAP", "CAPS", "SYP", "SYRUP", "INJ", "SUSP",
  "CRM", "CREAM", "OIN", "OINT", "GEL", "DRO", "DROPS", "POW", "POWDER",
  "LOT", "LOTION", "SOL", "SOLN", "SPR", "SPRAY", "LIQ", "LIQUID",
  "SACHET", "RESP", "RES", "TUBE", "BTL", "BOTTLE", "TON", "TONIC",
  "SUPP", "PESSARY", "GRAN", "GRANULES", "INH", "INHALER", "OIL",
  "SHAMPOO", "SOAP", "MOUTHWASH", "GARGLE", "ENEMA", "CARTRIDGE",
  "AMP", "VIAL", "PFS", "INFUS",
];
const FORM_SET = new Set(FORM_TOKENS);

const STRENGTH_RE =
  /(\d+(?:\.\d+)?)\s*(MG|MCG|GM|G|IU|%|MEQ|UNITS?|U|KU|MIU|LAC)\b/i;
const PACK_MEASURE_RE = /(\d+(?:\.\d+)?)\s*(ML|GM|G|GR)\b/i;
const NX_RE = /\b(\d+)\s*[xX*]\s*(\d+)\b/;
const TRAILING_QTY_RE = /\b(\d{1,4})\s*(TAB|CAP|TABS|CAPS|PCS|NOS|UNITS?)?\s*$/i;

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function s(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function cleanHeader(raw: string): string {
  // Strip rating prefixes like "(NRX)", "(GEN)", etc.
  return raw.replace(/^\([^)]+\)\s*/i, "").replace(/\s{2,}/g, " ").trim();
}

/** A row is an "item" row if cols 1..5 (item, description, rate, mrp, tax) have data. */
function isItemRow(r: RawRow): boolean {
  const item = s(r[1]);
  const mrp = num(r[4]);
  return item.length > 0 && mrp > 0;
}

/** A header row has text only in col 0 and the item/mrp cells are empty. */
function isHeaderRow(r: RawRow): boolean {
  const head = s(r[0]);
  const item = s(r[1]);
  return head.length > 2 && item.length === 0 && !/^\d+$/.test(head);
}

/** Parse one MARG report into items with their active group header attached. */
function parseSheet(rows: RawRow[]): ParsedItem[] {
  const out: ParsedItem[] = [];
  let activeHeader = "";

  for (const r of rows) {
    if (!r || r.length === 0) continue;
    if (isHeaderRow(r)) {
      activeHeader = cleanHeader(s(r[0]));
      continue;
    }
    if (!isItemRow(r)) continue;
    const item = s(r[1]);
    const description = s(r[2]);
    out.push({
      key: `${item.toUpperCase()}|${description.toUpperCase()}`,
      item,
      description,
      rate: num(r[3]),
      mrp: num(r[4]),
      gst: num(r[5]),
      header: activeHeader,
    });
  }
  return out;
}

async function readWorkbookFirstSheet(file: File): Promise<RawRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<RawRow>(ws, {
    header: 1,
    defval: "",
    blankrows: false,
  });
}

interface Extracted {
  form: string;
  strength: string;
  base_unit: string;
  secondary_unit: string;
  conversion: number;
}

/** Mirror the v3 extraction rules in TS. */
function extractAttributes(item: string, description: string): Extracted {
  const text = `${item} ${description}`.toUpperCase();

  // Form: first FORM_SET token we see
  let form = "";
  for (const tok of text.split(/[^A-Z]+/)) {
    if (tok && FORM_SET.has(tok)) {
      form = tok.replace(/S$/, ""); // normalise plural TABS→TAB
      if (form === "OINT") form = "OIN";
      if (form === "SYRUP") form = "SYP";
      if (form === "CREAM") form = "CRM";
      if (form === "DROPS") form = "DRO";
      if (form === "POWDER") form = "POW";
      if (form === "LOTION") form = "LOT";
      if (form === "SOLN") form = "SOL";
      if (form === "SPRAY") form = "SPR";
      if (form === "LIQUID") form = "LIQ";
      if (form === "TONIC") form = "TON";
      break;
    }
  }

  // Strength: number + (MG|MCG|%|IU|MEQ…)
  let strength = "";
  const mStr = text.match(STRENGTH_RE);
  if (mStr) strength = `${mStr[1]}${mStr[2].toUpperCase()}`;

  // Pack measure (ML / GM) — used for liquid/cream conversion
  const mPack = text.match(PACK_MEASURE_RE);
  const packSize = mPack ? parseFloat(mPack[1]) : 0;
  const packUnit = mPack ? mPack[2].toUpperCase() : "";

  // NxM conversion (e.g., 10x10) — secondary count comes from the second number
  const mNx = text.match(NX_RE);

  // Trailing qty in description (e.g., "10 TAB" or just "10")
  const mTail = description.toUpperCase().match(TRAILING_QTY_RE);

  // ----- Decide units -----
  let base_unit = "";
  let secondary_unit = "";
  let conversion = 0;

  if (form === "TAB" || form === "CAP") {
    base_unit = form;
    secondary_unit = "STRIP";
    if (mNx) conversion = parseInt(mNx[2], 10);
    else if (mTail) conversion = parseInt(mTail[1], 10);
  } else if (packUnit === "ML" || form === "SYP" || form === "DRO" || form === "SUSP" || form === "LIQ" || form === "TON" || form === "SOL" || form === "SPR") {
    base_unit = "ML";
    secondary_unit = form === "DRO" ? "BOTTLE" : "BOTTLE";
    if (packUnit === "ML" && packSize > 0) conversion = packSize;
  } else if (packUnit === "GM" || packUnit === "G" || form === "CRM" || form === "OIN" || form === "GEL" || form === "POW") {
    base_unit = "GM";
    secondary_unit = "TUBE";
    if ((packUnit === "GM" || packUnit === "G") && packSize > 0) conversion = packSize;
  } else if (form === "INJ") {
    base_unit = "ML";
    secondary_unit = "VIAL";
    if (packUnit === "ML" && packSize > 0) conversion = packSize;
  } else {
    base_unit = form || "PCS";
    if (mNx) {
      secondary_unit = "PACK";
      conversion = parseInt(mNx[2], 10);
    } else if (mTail && mTail[1]) {
      secondary_unit = "PACK";
      conversion = parseInt(mTail[1], 10);
    }
  }

  if (conversion < 1 || !Number.isFinite(conversion)) conversion = 0;
  if (!secondary_unit) secondary_unit = "";

  return { form, strength, base_unit, secondary_unit, conversion };
}

function cleanProductName(item: string, description: string): string {
  // Strip the trailing pack-size noise from item so the canonical name stays compact.
  const raw = `${item} ${description}`.trim();
  return raw
    .replace(/\s{2,}/g, " ")
    .replace(/\s*\(\s*\)\s*/g, " ")
    .trim();
}

export interface MergeResult {
  rows: MargMasterRow[];
  stats: {
    fileA_items: number;
    fileB_items: number;
    merged: number;
    onlyInA: number;
    onlyInB: number;
    withStrength: number;
    withConversion: number;
    withManufacturer: number;
    withComposition: number;
  };
}

/**
 * Merge the two MARG exports into v3-shaped rows.
 *
 * @param manufacturerFile  Book2.xlsx (grouped by manufacturer)
 * @param compositionFile   REPORT_1-2.XLS (grouped by composition / category)
 */
export async function mergeMargFiles(
  manufacturerFile: File,
  compositionFile: File,
): Promise<MergeResult> {
  const [rawA, rawB] = await Promise.all([
    readWorkbookFirstSheet(manufacturerFile),
    readWorkbookFirstSheet(compositionFile),
  ]);

  const itemsA = parseSheet(rawA); // header = manufacturer
  const itemsB = parseSheet(rawB); // header = composition

  // Index file B by key so we can attach composition to file A items quickly.
  const bByKey = new Map<string, ParsedItem>();
  for (const it of itemsB) {
    if (!bByKey.has(it.key)) bByKey.set(it.key, it);
  }

  const merged: MargMasterRow[] = [];
  const seenKeys = new Set<string>();
  let onlyA = 0;
  let onlyB = 0;

  for (const a of itemsA) {
    seenKeys.add(a.key);
    const b = bByKey.get(a.key);
    if (!b) onlyA++;

    const ext = extractAttributes(a.item, a.description);
    merged.push({
      clean_name: cleanProductName(a.item, a.description),
      original_name: `${a.item} ${a.description}`.trim(),
      manufacturer: a.header || "",
      composition: b?.header || "",
      form: ext.form,
      strength: ext.strength,
      base_unit: ext.base_unit,
      secondary_unit: ext.secondary_unit,
      conversion: ext.conversion || "",
      mrp: a.mrp || b?.mrp || 0,
      rate: a.rate || b?.rate || 0,
      gst_percent: a.gst || b?.gst || 0,
    });
  }

  // Add items present only in B (composition file) — manufacturer will be blank.
  for (const b of itemsB) {
    if (seenKeys.has(b.key)) continue;
    onlyB++;
    const ext = extractAttributes(b.item, b.description);
    merged.push({
      clean_name: cleanProductName(b.item, b.description),
      original_name: `${b.item} ${b.description}`.trim(),
      manufacturer: "",
      composition: b.header || "",
      form: ext.form,
      strength: ext.strength,
      base_unit: ext.base_unit,
      secondary_unit: ext.secondary_unit,
      conversion: ext.conversion || "",
      mrp: b.mrp,
      rate: b.rate,
      gst_percent: b.gst,
    });
  }

  const stats = {
    fileA_items: itemsA.length,
    fileB_items: itemsB.length,
    merged: merged.length,
    onlyInA: onlyA,
    onlyInB: onlyB,
    withStrength: merged.filter((r) => r.strength).length,
    withConversion: merged.filter((r) => Number(r.conversion) > 0).length,
    withManufacturer: merged.filter((r) => r.manufacturer).length,
    withComposition: merged.filter((r) => r.composition).length,
  };

  return { rows: merged, stats };
}

/** Convert merged rows back to a downloadable v3-style CSV (handy as a backup). */
export function mergedRowsToCsv(rows: MargMasterRow[]): string {
  const headers = [
    "clean_name", "original_name", "manufacturer", "composition",
    "form", "strength", "base_unit", "secondary_unit", "conversion",
    "mrp", "rate", "gst_percent",
  ] as const;
  const esc = (v: unknown) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => esc((r as Record<string, unknown>)[h])).join(","));
  }
  return lines.join("\n");
}
