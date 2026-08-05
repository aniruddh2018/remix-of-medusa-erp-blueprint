import * as XLSX from "xlsx";

/**
 * Parser for MARG ERP "Purchase Statement" exports (REPORT_PUR.XLS).
 *
 * Layout (7 columns):
 *   Row 0..3 : shop header
 *   Row 6    : "PURCHASE STATEMENT FROM dd-mm-yyyy TO dd-mm-yyyy"
 *   Row 7    : column header (BILL NO. | PARTY NAME | AMOUNT | DISCOUNT | NET AMT | TAX PAYABLE | DR/CR NET AMOUNT)
 *   then repeating:
 *     <date row>         col0 = "DD-MM-YYYY"
 *     <bill header row>  col0 = "P000001" col1 = "<supplier name>"
 *                        col2 = amount col3 = disc col4 = net col5 = tax col6 = "dr/cr  netAmount"
 *     <item rows...>     col0 = "<name>" col1 = "<desc?> <pack> <batch> <qty>" ...
 *                        col6 = per-unit rate
 *     <blank row>        separator
 */

export interface ParsedPurchaseItem {
  name: string;
  description: string;
  pack: string;
  batch_number: string;
  qty_strips: number;
  qty_loose: number;
  free_strips: number;
  free_loose: number;
  amount: number;
  discount: number;
  net_amount: number;
  tax: number;
  rate: number; // per-unit (mrp/purchase price proxy)
  raw: string;
}

export interface ParsedPurchaseBill {
  bill_no: string;
  bill_date: string; // ISO yyyy-mm-dd
  supplier_name: string;
  amount: number;
  discount: number;
  net_amount: number;
  tax: number;
  bill_total: number; // last column rightmost number
  items: ParsedPurchaseItem[];
}

export interface PurchaseParseStats {
  totalBills: number;
  totalItems: number;
  distinctSuppliers: number;
  distinctProducts: number;
  dateRange: { from: string; to: string } | null;
}

export interface PurchaseParseResult {
  bills: ParsedPurchaseBill[];
  stats: PurchaseParseStats;
  warnings: string[];
}

const isDate = (s: string) => /^\d{2}-\d{2}-\d{4}$/.test(s);
const isBillNo = (s: string) => /^P\d{4,}$/i.test(s.trim());
const parseDate = (s: string): string => {
  const [dd, mm, yyyy] = s.split("-");
  return `${yyyy}-${mm}-${dd}`;
};
const num = (v: unknown): number => {
  if (v == null) return 0;
  const s = String(v).replace(/[, ]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const QTY_RE = /^(\d+)(?::(\d+))?(?:\+(\d+)(?::(\d+))?)?$|^(\d+)\+(\d+)$/;

function parseQty(tok: string): { ps: number; pl: number; fs: number; fl: number } | null {
  const m = tok.match(QTY_RE);
  if (!m) return null;
  if (m[5]) {
    // N+M format: paid strips + free strips
    return { ps: parseInt(m[5], 10) || 0, pl: 0, fs: parseInt(m[6], 10) || 0, fl: 0 };
  }
  return {
    ps: parseInt(m[1], 10) || 0,
    pl: m[2] ? parseInt(m[2], 10) : 0,
    fs: m[3] ? parseInt(m[3], 10) : 0,
    fl: m[4] ? parseInt(m[4], 10) : 0,
  };
}

function isPackPattern(tok: string): boolean {
  const t = tok.toUpperCase().replace(/\s+/g, "");
  return /^(\d+)\*(\d+)$/.test(t) || /^(\d+)'S$/.test(t) || /^\d+(?:TAB|CAP|TABS|CAPS|PCS|NOS|UNITS?|S|ML|GM|G|MG|MCG|L)$/.test(t);
}

function isBatchLike(tok: string): boolean {
  return /[A-Za-z]/.test(tok) && /\d/.test(tok);
}

/** Split combined col1 "  desc  pack  batch  qty" right-to-left.
 *  Heuristics: qty is rightmost; next is batch (alphanumeric) or pack (10*10, 10'S, etc.);
 *  everything before is description.
 */
function splitItemDetails(s: string): {
  description: string;
  pack: string;
  batch: string;
  qty: { ps: number; pl: number; fs: number; fl: number };
} {
  const toks = s.trim().split(/\s+/).filter(Boolean);
  let qty = { ps: 0, pl: 0, fs: 0, fl: 0 };
  let qtyIdx = -1;
  // Find qty from the right
  for (let i = toks.length - 1; i >= 0; i--) {
    const q = parseQty(toks[i]);
    if (q) { qty = q; qtyIdx = i; break; }
  }
  if (qtyIdx < 0) {
    return { description: toks.join(" "), pack: "", batch: "", qty };
  }
  const before = toks.slice(0, qtyIdx);
  let batch = "";
  let pack = "";

  if (before.length >= 3) {
    batch = before.pop()!;
    const next = before[before.length - 1];
    if (/^(ML|GM|G|MG|MCG|L|S|TAB|CAP|GEL)$/i.test(next) && before.length >= 2) {
      pack = before.pop()!;
      pack = before.pop()! + " " + pack;
    } else {
      pack = before.pop()!;
    }
  } else if (before.length === 2) {
    const last = before.pop()!;
    if (isPackPattern(last)) {
      pack = last;
      // first token stays as description
    } else if (isBatchLike(last)) {
      batch = last;
      const first = before[0];
      if (isPackPattern(first)) {
        pack = first;
        before.pop();
      }
    } else {
      batch = last;
      // first token stays as description
    }
  } else if (before.length === 1) {
    const only = before.pop()!;
    if (isPackPattern(only)) pack = only;
    else batch = only;
  }

  return { description: before.join(" ").trim(), pack, batch, qty };
}

/**
 * Given an original set (invoices + challans) and an invoices-only set,
 * split the original into two groups:
 *   - invoices: bills whose bill_no exists in invoicesOnly
 *   - challans: bills whose bill_no exists only in original (not in invoicesOnly)
 */
export function splitPurchaseBills(
  original: ParsedPurchaseBill[],
  invoicesOnly: ParsedPurchaseBill[],
): {
  invoices: ParsedPurchaseBill[];
  challans: ParsedPurchaseBill[];
  unmatchedInvoiceBills: ParsedPurchaseBill[];
  stats: {
    totalOriginalBills: number;
    totalOriginalItems: number;
    invoiceBills: number;
    invoiceItems: number;
    challanBills: number;
    challanItems: number;
    unmatchedInvoiceBillsCount: number;
    unmatchedInvoiceItems: number;
  };
} {
  const invoiceNos = new Set(invoicesOnly.map((b) => b.bill_no.toUpperCase().trim()));
  const originalNos = new Set(original.map((b) => b.bill_no.toUpperCase().trim()));

  const invoices: ParsedPurchaseBill[] = [];
  const challans: ParsedPurchaseBill[] = [];
  const unmatchedInvoiceBills: ParsedPurchaseBill[] = [];

  for (const b of original) {
    if (invoiceNos.has(b.bill_no.toUpperCase().trim())) {
      invoices.push(b);
    } else {
      challans.push(b);
    }
  }

  for (const b of invoicesOnly) {
    if (!originalNos.has(b.bill_no.toUpperCase().trim())) {
      unmatchedInvoiceBills.push(b);
    }
  }

  const totalOriginalItems = original.reduce((s, b) => s + b.items.length, 0);
  const invoiceItems = invoices.reduce((s, b) => s + b.items.length, 0);
  const challanItems = challans.reduce((s, b) => s + b.items.length, 0);
  const unmatchedInvoiceItems = unmatchedInvoiceBills.reduce((s, b) => s + b.items.length, 0);

  return {
    invoices,
    challans,
    unmatchedInvoiceBills,
    stats: {
      totalOriginalBills: original.length,
      totalOriginalItems,
      invoiceBills: invoices.length,
      invoiceItems,
      challanBills: challans.length,
      challanItems,
      unmatchedInvoiceBillsCount: unmatchedInvoiceBills.length,
      unmatchedInvoiceItems,
    },
  };
}

export async function parseMargPurchaseFile(file: File): Promise<PurchaseParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: null });

  const bills: ParsedPurchaseBill[] = [];
  const warnings: string[] = [];
  const supplierSet = new Set<string>();
  const productSet = new Set<string>();
  let minDate: string | null = null;
  let maxDate: string | null = null;
  let activeDate: string | null = null;
  let current: ParsedPurchaseBill | null = null;

  const push = () => {
    if (current && current.items.length > 0) bills.push(current);
    current = null;
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const c0 = (r[0] ?? "").toString().trim();
    const c1 = (r[1] ?? "").toString();
    const c2 = (r[2] ?? "").toString().trim();

    if (!c0 && !c1.trim() && !c2) { push(); continue; }

    if (isDate(c0) && !c1.trim() && !c2) {
      activeDate = parseDate(c0);
      if (!minDate || activeDate < minDate) minDate = activeDate;
      if (!maxDate || activeDate > maxDate) maxDate = activeDate;
      continue;
    }

    if (isBillNo(c0)) {
      push();
      const c6 = (r[6] ?? "").toString().trim();
      // c6 might be "0.00    3084.00" — take the last number as bill_total
      const c6Nums = c6.match(/[\d.]+/g) ?? [];
      const billTotal = c6Nums.length > 0 ? parseFloat(c6Nums[c6Nums.length - 1]) || 0 : 0;
      current = {
        bill_no: c0,
        bill_date: activeDate ?? new Date().toISOString().slice(0, 10),
        supplier_name: c1.trim() || "CASH",
        amount: num(r[2]),
        discount: num(r[3]),
        net_amount: num(r[4]),
        tax: num(r[5]),
        bill_total: billTotal,
        items: [],
      };
      supplierSet.add(current.supplier_name.toUpperCase());
      continue;
    }

    // Item line: col0 has product name (not bill no, not date), col1 has details
    if (c0 && !isBillNo(c0) && !isDate(c0) && current) {
      const det = splitItemDetails(c1);
      const item: ParsedPurchaseItem = {
        name: c0,
        description: det.description,
        pack: det.pack,
        batch_number: det.batch,
        qty_strips: det.qty.ps,
        qty_loose: det.qty.pl,
        free_strips: det.qty.fs,
        free_loose: det.qty.fl,
        amount: num(r[2]),
        discount: num(r[3]),
        net_amount: num(r[4]),
        tax: num(r[5]),
        rate: num(r[6]),
        raw: `${c0} | ${c1}`,
      };
      current.items.push(item);
      productSet.add(c0.toUpperCase());
    }
  }
  push();

  const totalItems = bills.reduce((s, b) => s + b.items.length, 0);
  return {
    bills,
    warnings,
    stats: {
      totalBills: bills.length,
      totalItems,
      distinctSuppliers: supplierSet.size,
      distinctProducts: productSet.size,
      dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : null,
    },
  };
}
