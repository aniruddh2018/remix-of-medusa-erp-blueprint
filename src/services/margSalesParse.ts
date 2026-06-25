import * as XLSX from "xlsx";

/**
 * Parser for MARG ERP "Bill Wise Sales Statement" exports (REPORT_7.XLS).
 *
 * File layout (3 columns):
 *   Row 0..3  : shop header
 *   Row 4     : column header "BILL NO. | DESCRIPTION | BILL VALUE"
 *   then repeating:
 *     <date row>         col0 = "DD-MM-YYYY"
 *     <bill header row>  col0 = "A000001" col1 = "<phone> <name>" + " CASH/CREDIT" col2 = total
 *     <item rows...>     col1 = "sn drug# NAME pack qty rate"  col2 = "MM/YY batch"
 *     <blank row>        separator
 */

export interface ParsedBillItem {
  serial: number;
  drug_code: string;
  name: string;
  pack: string;
  qty_strips: number;
  qty_loose: number;
  rate: number;
  expiry: string | null; // ISO yyyy-mm-dd (first of month)
  batch_number: string | null;
  raw: string;
}

export interface ParsedBill {
  invoice_number: string;
  bill_date: string; // ISO yyyy-mm-dd
  customer_phone: string | null;
  customer_name: string;
  payment_mode: "cash" | "credit";
  bill_value: number;
  items: ParsedBillItem[];
}

export interface ParseStats {
  totalBills: number;
  totalItems: number;
  dateRange: { from: string; to: string } | null;
  distinctCustomers: number;
  distinctProducts: number;
}

export interface ParseResult {
  bills: ParsedBill[];
  stats: ParseStats;
  warnings: string[];
}

const isDate = (s: string) => /^\d{2}-\d{2}-\d{4}$/.test(s);
const isBillNo = (s: string) => /^[A-Z]\d{4,}$/.test(s.trim());

const parseDate = (s: string): string => {
  const [dd, mm, yyyy] = s.split("-");
  return `${yyyy}-${mm}-${dd}`;
};

const parseExpiry = (s: string): { exp: string | null; batch: string | null } => {
  const t = s.trim();
  if (!t) return { exp: null, batch: null };
  const m = t.match(/^(\d{1,2})\/(\d{2,4})(?:\s+(.+))?$/);
  if (!m) return { exp: null, batch: t || null };
  const mm = m[1].padStart(2, "0");
  let yy = m[2];
  if (yy.length === 2) yy = (parseInt(yy, 10) > 50 ? "19" : "20") + yy;
  return { exp: `${yy}-${mm}-01`, batch: m[3]?.trim() || null };
};

/**
 * Parse a bill header row like:
 *   "8719877268 SYAMU BAI" payment="CASH"
 *   "ONL 650"
 *   "CASH"
 */
function parseCustomer(s: string): { phone: string | null; name: string; mode: "cash" | "credit" } {
  const raw = (s || "").trim();
  const tokens = raw.split(/\s+/);
  let mode: "cash" | "credit" = "cash";
  // Last token is sometimes CASH/CREDIT but here payment_mode column appears outside.
  // We'll detect a trailing CASH/CREDIT word if present and strip it.
  const last = tokens[tokens.length - 1]?.toUpperCase();
  if (last === "CASH" || last === "CREDIT") {
    mode = last.toLowerCase() as "cash" | "credit";
    tokens.pop();
  }
  if (tokens.length === 0) return { phone: null, name: "Walk-in", mode };
  const phoneMatch = tokens[0].match(/^\d{10,}$/);
  if (phoneMatch) {
    const phone = tokens.shift()!;
    return { phone, name: tokens.join(" ") || "Walk-in", mode };
  }
  return { phone: null, name: tokens.join(" ") || "Walk-in", mode };
}

/**
 * Item description format (whitespace-delimited fixed-ish columns):
 *   "1   0 AFFYVIT D3           1*8           0:4      290.00"
 *   serial drug# NAME...........  pack         strips:loose   rate
 *
 * Strategy: split on whitespace runs. First token = serial, second = drug#,
 * then walk back from the end:  rate = last numeric, qty = previous "x:y" token,
 * pack = previous token, the remainder joined is name.
 */
function parseItem(s: string): ParsedBillItem | null {
  const raw = s.replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const toks = raw.split(" ");
  if (toks.length < 5) return null;
  const serial = parseInt(toks[0], 10);
  const drug = toks[1];
  if (Number.isNaN(serial)) return null;

  // Rate is last token that looks like a number
  let rateIdx = toks.length - 1;
  while (rateIdx > 2 && !/^\d+(\.\d+)?$/.test(toks[rateIdx])) rateIdx--;
  const rate = parseFloat(toks[rateIdx] || "0") || 0;

  // Qty token: scan backwards from rateIdx-1 for "N:N" or single integer
  let qtyIdx = rateIdx - 1;
  let strips = 0;
  let loose = 0;
  while (qtyIdx > 2) {
    const t = toks[qtyIdx];
    const m = t.match(/^(\d+):(\d+)$/);
    if (m) {
      strips = parseInt(m[1], 10);
      loose = parseInt(m[2], 10);
      break;
    }
    if (/^\d+$/.test(t)) {
      strips = parseInt(t, 10);
      break;
    }
    qtyIdx--;
  }

  // Pack token: previous to qty
  const packIdx = qtyIdx - 1 > 2 ? qtyIdx - 1 : -1;
  const pack = packIdx > 0 ? toks[packIdx] : "";

  const nameEnd = packIdx > 0 ? packIdx : qtyIdx;
  const name = toks.slice(2, nameEnd).join(" ").trim();

  return {
    serial,
    drug_code: drug,
    name,
    pack,
    qty_strips: strips,
    qty_loose: loose,
    rate,
    expiry: null,
    batch_number: null,
    raw,
  };
}

export async function parseMargSalesFile(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: null });

  const bills: ParsedBill[] = [];
  const warnings: string[] = [];
  let activeDate: string | null = null;
  let current: ParsedBill | null = null;
  const customerSet = new Set<string>();
  const productSet = new Set<string>();
  let minDate: string | null = null;
  let maxDate: string | null = null;

  const pushCurrent = () => {
    if (current && current.items.length > 0) bills.push(current);
    current = null;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const c0 = (row[0] ?? "").toString().trim();
    const c1 = (row[1] ?? "").toString();
    const c2 = (row[2] ?? "").toString().trim();

    if (!c0 && !c1.trim() && !c2) {
      pushCurrent();
      continue;
    }

    if (isDate(c0) && !c1.trim() && !c2) {
      activeDate = parseDate(c0);
      if (!minDate || activeDate < minDate) minDate = activeDate;
      if (!maxDate || activeDate > maxDate) maxDate = activeDate;
      continue;
    }

    if (isBillNo(c0)) {
      pushCurrent();
      const cust = parseCustomer(c1);
      // payment mode may also be encoded as trailing CASH on the description column itself.
      const billValue = parseFloat(c2.replace(/[, ]/g, "")) || 0;
      current = {
        invoice_number: c0,
        bill_date: activeDate ?? new Date().toISOString().slice(0, 10),
        customer_phone: cust.phone,
        customer_name: cust.name,
        payment_mode: cust.mode,
        bill_value: billValue,
        items: [],
      };
      if (cust.phone) customerSet.add(cust.phone);
      else customerSet.add(`name:${cust.name}`);
      continue;
    }

    // Item line — col0 blank, col1 non-empty starting with digits
    if (!c0 && c1.trim() && /^\s*\d+\s+/.test(c1)) {
      if (!current) {
        warnings.push(`Row ${i + 1}: item line before any bill header — skipped`);
        continue;
      }
      const item = parseItem(c1);
      if (!item) {
        warnings.push(`Row ${i + 1}: could not parse item "${c1.trim()}"`);
        continue;
      }
      const { exp, batch } = parseExpiry(c2);
      item.expiry = exp;
      item.batch_number = batch;
      current.items.push(item);
      productSet.add(item.name.toUpperCase());
    }
  }
  pushCurrent();

  const totalItems = bills.reduce((s, b) => s + b.items.length, 0);
  return {
    bills,
    warnings,
    stats: {
      totalBills: bills.length,
      totalItems,
      dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : null,
      distinctCustomers: customerSet.size,
      distinctProducts: productSet.size,
    },
  };
}
