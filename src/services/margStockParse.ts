import * as XLSX from "xlsx";

/**
 * Parser for MARG ERP "Stock Report" exports.
 *
 * Supports TWO layouts, auto-detected from the header row:
 *
 * A. DETAILED (23 cols) — one row per BATCH, with proper batch/expiry/supplier:
 *      0 Code | 1 Product Name | 2 Unit | 3 Current Stock
 *      4 Sales Deal | 5 Sales Free | 6 Purc Deal | 7 Purc Free
 *      8 Cost Price | 9 Value | 10 MRP | 11 Purchase Price | 12 Sales Price
 *      13 Company | 14 Manufacturer
 *      15 Rec.Date | 16 Batch | 17 MFG | 18 EXP
 *      19 Supplier | 20 Inv.No | 21 Inv.Date | 22 Rack No.
 *
 * B. LEGACY (16 cols) — aggregated per product, no batch/expiry:
 *      0 code | 1 name | 2 unit | 3 qty | 6 scheme_qty | 7 scheme_free
 *      8 purchase_rate | 9 stock_value | 10 mrp | 11 sale_rate | 12 ptr
 *      13 manufacturer | 15 rack
 */

export type StockFileFormat = "detailed" | "legacy";

export interface ParsedStockRow {
  code: string;
  name: string;
  unit: string;
  qtyRaw: number;
  scheme_qty: number;
  scheme_free: number;
  purchase_price: number;
  cost_price: number;
  stock_value: number;
  mrp: number;
  sale_price: number;
  ptr: number;
  manufacturer: string;
  rack: string;
  // Detailed-only fields (empty for legacy):
  batch_number: string;
  mfg_date: string | null;     // ISO yyyy-mm-dd
  expiry_date: string | null;  // ISO yyyy-mm-dd
  received_date: string | null;
  supplier_name: string;
  invoice_no: string;
  invoice_date: string | null;
}

export interface StockParseStats {
  totalRows: number;
  distinctProducts: number;
  distinctManufacturers: number;
  distinctSuppliers: number;
  batchesWithExpiry: number;
  totalStockValue: number;
  zeroQtyRows: number;
}

export interface StockParseResult {
  format: StockFileFormat;
  rows: ParsedStockRow[];
  stats: StockParseStats;
  warnings: string[];
}

const num = (v: unknown): number => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/** Parse MARG date strings: "01-Feb-30" | "07-Jul-26" | "  -   -" | "" -> ISO or null. */
function parseMargDate(v: unknown): string | null {
  const s = str(v);
  if (!s || /^-*\s*-*$/.test(s.replace(/\s+/g, ""))) return null;
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = MONTHS[m[2].toUpperCase()];
    if (!mm) return null;
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = (parseInt(yyyy, 10) >= 70 ? "19" : "20") + yyyy;
    return `${yyyy}-${mm}-${dd}`;
  }
  // Fallback: try native Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function detectFormat(rows: unknown[][]): { format: StockFileFormat; dataStart: number } {
  // Scan first 10 rows for a header containing "Batch" and "EXP"
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const cells = (rows[i] ?? []).map((c) => str(c).toUpperCase());
    if (cells.includes("BATCH") && (cells.includes("EXP") || cells.some((c) => c.startsWith("EXP")))) {
      // Data starts after this header (skip sub-header if present)
      let start = i + 1;
      // Skip sub-header row that has "Deal"/"Free" splits under Sales/Purc Scheme
      const next = (rows[start] ?? []).map((c) => str(c).toUpperCase());
      if (next.includes("DEAL") || next.includes("FREE")) start += 1;
      return { format: "detailed", dataStart: start };
    }
  }
  return { format: "legacy", dataStart: 0 };
}

export async function parseMargStockFile(file: File): Promise<StockParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1, blankrows: false, defval: null,
  });

  const { format, dataStart } = detectFormat(raw);
  const rows: ParsedStockRow[] = [];
  const warnings: string[] = [];
  const mfrs = new Set<string>();
  const products = new Set<string>();
  const suppliers = new Set<string>();
  let totalValue = 0;
  let zeroQty = 0;
  let withExpiry = 0;

  for (let i = dataStart; i < raw.length; i++) {
    const r = raw[i] ?? [];
    const code = str(r[0]);
    const name = str(r[1]);
    if (!code || !name) continue;
    if (code.length > 30 || name.length > 200) continue;

    const qty = num(r[3]);
    let row: ParsedStockRow;

    if (format === "detailed") {
      row = {
        code, name,
        unit: str(r[2]),
        qtyRaw: qty,
        scheme_qty: num(r[6]),
        scheme_free: num(r[7]),
        cost_price: num(r[8]),
        stock_value: num(r[9]),
        mrp: num(r[10]),
        purchase_price: num(r[11]),
        sale_price: num(r[12]),
        ptr: num(r[12]),
        manufacturer: str(r[14]) || str(r[13]),
        rack: str(r[22]),
        batch_number: str(r[16]),
        received_date: parseMargDate(r[15]),
        mfg_date: parseMargDate(r[17]),
        expiry_date: parseMargDate(r[18]),
        supplier_name: str(r[19]),
        invoice_no: str(r[20]),
        invoice_date: parseMargDate(r[21]),
      };
    } else {
      row = {
        code, name,
        unit: str(r[2]),
        qtyRaw: qty,
        scheme_qty: num(r[6]),
        scheme_free: num(r[7]),
        cost_price: num(r[8]),
        stock_value: num(r[9]),
        purchase_price: num(r[8]),
        mrp: num(r[10]),
        sale_price: num(r[11]),
        ptr: num(r[12]),
        manufacturer: str(r[13]),
        rack: str(r[15]),
        batch_number: "",
        received_date: null, mfg_date: null, expiry_date: null,
        supplier_name: "", invoice_no: "", invoice_date: null,
      };
    }

    if (qty <= 0) zeroQty++;
    if (row.expiry_date) withExpiry++;
    if (row.manufacturer) mfrs.add(row.manufacturer.toUpperCase());
    if (row.supplier_name) suppliers.add(row.supplier_name.toUpperCase());
    products.add(row.name.toUpperCase());
    totalValue += row.stock_value;
    rows.push(row);
  }

  return {
    format,
    rows,
    warnings,
    stats: {
      totalRows: rows.length,
      distinctProducts: products.size,
      distinctManufacturers: mfrs.size,
      distinctSuppliers: suppliers.size,
      batchesWithExpiry: withExpiry,
      totalStockValue: Math.round(totalValue * 100) / 100,
      zeroQtyRows: zeroQty,
    },
  };
}
