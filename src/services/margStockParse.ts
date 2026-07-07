import * as XLSX from "xlsx";

/**
 * Parser for MARG ERP "Stock Report" export (stock_XX.xls).
 *
 * Column layout (16 cols, no header row — data starts at row 1):
 *   0  item_code (MARG internal code, e.g. "01630", "T9776A")
 *   1  item_name
 *   2  base_unit / pack unit ("TAB", "CAP", "INJ", "SYP" ...)
 *   3  quantity  (float: whole = strips/packs, decimal = loose units as fraction of pack)
 *   4  reserved (usually 0)
 *   5  reserved (usually 0)
 *   6  scheme_qty (e.g. 5 in "5+1 free")
 *   7  scheme_free (e.g. 1 in "5+1 free")
 *   8  purchase_rate_per_strip
 *   9  stock_value  ( = col3 * col8 )
 *  10  mrp
 *  11  sale_rate
 *  12  ptr (retailer price, often = mrp when 0)
 *  13  manufacturer
 *  14  (blank)
 *  15  rack / location
 *
 * Row 0 is the shop banner and is skipped.
 */

export interface ParsedStockRow {
  code: string;
  name: string;
  unit: string;
  qtyRaw: number;
  scheme_qty: number;
  scheme_free: number;
  purchase_price: number;
  stock_value: number;
  mrp: number;
  sale_price: number;
  ptr: number;
  manufacturer: string;
  rack: string;
}

export interface StockParseStats {
  totalRows: number;
  distinctManufacturers: number;
  totalStockValue: number;
  zeroQtyRows: number;
}

export interface StockParseResult {
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

export async function parseMargStockFile(file: File): Promise<StockParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1, blankrows: false, defval: null,
  });

  const rows: ParsedStockRow[] = [];
  const warnings: string[] = [];
  const mfrs = new Set<string>();
  let totalValue = 0;
  let zeroQty = 0;

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] ?? [];
    const code = str(r[0]);
    const name = str(r[1]);
    // Skip banner / non-data rows: item code must be alphanumeric and name non-empty
    if (!code || !name) continue;
    if (code.length > 30 || name.length > 200) continue; // banner rows
    const qty = num(r[3]);
    const row: ParsedStockRow = {
      code,
      name,
      unit: str(r[2]),
      qtyRaw: qty,
      scheme_qty: num(r[6]),
      scheme_free: num(r[7]),
      purchase_price: num(r[8]),
      stock_value: num(r[9]),
      mrp: num(r[10]),
      sale_price: num(r[11]),
      ptr: num(r[12]),
      manufacturer: str(r[13]),
      rack: str(r[15]),
    };
    if (qty <= 0) zeroQty++;
    if (row.manufacturer) mfrs.add(row.manufacturer.toUpperCase());
    totalValue += row.stock_value;
    rows.push(row);
  }

  return {
    rows,
    warnings,
    stats: {
      totalRows: rows.length,
      distinctManufacturers: mfrs.size,
      totalStockValue: Math.round(totalValue * 100) / 100,
      zeroQtyRows: zeroQty,
    },
  };
}
