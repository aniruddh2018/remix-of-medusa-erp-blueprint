import * as XLSX from "xlsx";

/**
 * Parser for MARG "Bill vs Doctor Wise Sale Analysis" (bill_vs_doctor_wise_sale_analysis.xls).
 *
 * Layout:
 *   Row 0..4  Shop headers (name, address, title, period, blank)
 *   Row 5     Column headers: Bill VS Doctor | Sale Qty | Free Qty | Amount | ...
 *   From row 6 onward, invoice + doctor come in *pairs*:
 *     - Line 1:  first cell = invoice number like "A000001"
 *     - Line 2:  first cell = doctor descriptor "    <CODE>         <NAME>"  or blank if no doctor
 *
 * We collapse into one record per invoice with an optional doctor code + name.
 */

export interface ParsedBillDoctor {
  invoice_number: string;
  doctor_code: string | null;
  doctor_name: string | null;
}

export interface DoctorParseResult {
  rows: ParsedBillDoctor[];
  distinctDoctors: { code: string; name: string; count: number }[];
  stats: {
    totalBills: number;
    billsWithDoctor: number;
    billsWithoutDoctor: number;
  };
  warnings: string[];
}

const isInvoiceNo = (s: string) => /^[A-Z]\d{4,}$/.test(s.trim());

function parseDoctorLine(s: string): { code: string | null; name: string | null } {
  // Format examples:
  //   "    DB         DINESH BHURIYA SIR"
  //   "    IP         INDRESH PATIDAR"
  //   "    7869507351 VIJAY PATIDAR"    (phone-as-code)
  const raw = (s || "").trim();
  if (!raw) return { code: null, name: null };
  // First whitespace-separated token = code, rest = name
  const m = raw.match(/^(\S+)\s+(.+)$/);
  if (!m) return { code: raw, name: null };
  return { code: m[1], name: m[2].trim() };
}

export async function parseMargDoctorMapFile(file: File): Promise<DoctorParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: null });

  const parsed: ParsedBillDoctor[] = [];
  const warnings: string[] = [];
  const docCounts = new Map<string, { code: string; name: string; count: number }>();

  // Locate first invoice row.
  let i = 0;
  for (; i < rows.length; i++) {
    const c0 = String(rows[i]?.[0] ?? "").trim();
    if (isInvoiceNo(c0)) break;
  }

  while (i < rows.length) {
    const row = rows[i] ?? [];
    const c0 = String(row[0] ?? "").trim();

    if (!isInvoiceNo(c0)) { i++; continue; }
    const invoice = c0;
    const next = rows[i + 1] ?? [];
    const nextCell = String(next[0] ?? "");
    const nextTrim = nextCell.trim();
    let code: string | null = null;
    let name: string | null = null;

    // A "doctor" row is the immediate next row when its first cell is non-empty
    // and NOT another invoice number. MARG pads with leading spaces so we check
    // both the padded and trimmed versions.
    if (nextTrim && !isInvoiceNo(nextTrim)) {
      const parsedDoc = parseDoctorLine(nextCell);
      code = parsedDoc.code;
      name = parsedDoc.name;
    }

    parsed.push({ invoice_number: invoice, doctor_code: code, doctor_name: name });

    if (code || name) {
      const key = `${(code ?? "").toUpperCase()}|${(name ?? "").toUpperCase()}`;
      const hit = docCounts.get(key);
      if (hit) hit.count++;
      else docCounts.set(key, { code: code ?? "", name: name ?? "", count: 1 });
    }
    i += 2;
  }

  const withDoc = parsed.filter(p => p.doctor_code || p.doctor_name).length;
  return {
    rows: parsed,
    distinctDoctors: [...docCounts.values()].sort((a, b) => b.count - a.count),
    stats: {
      totalBills: parsed.length,
      billsWithDoctor: withDoc,
      billsWithoutDoctor: parsed.length - withDoc,
    },
    warnings,
  };
}
