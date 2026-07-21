import * as XLSX from "xlsx";

/**
 * Parser for MARG ERP "Ledger Accounts" (trial balance) export.
 * Expected layout after 2 title rows:
 *   SERIAL | LEDGER | GROUP | OPENING | DEBIT | CREDIT | BALANCE
 * In MARG, a NEGATIVE balance = CREDIT (payable / liability),
 * a POSITIVE balance = DEBIT  (receivable / asset).
 */

export interface ParsedLedgerBalanceRow {
  serial: string;
  ledgerName: string;
  groupName: string;
  opening: number;
  debit: number;
  credit: number;
  balance: number;
}

export interface LedgerBalanceParseStats {
  totalRows: number;
  distinctGroups: number;
  totalDebit: number;
  totalCredit: number;
  nonZeroRows: number;
}

export interface LedgerBalanceParseResult {
  rows: ParsedLedgerBalanceRow[];
  stats: LedgerBalanceParseStats;
  warnings: string[];
}

const num = (v: unknown): number => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/[, ]/g, "").trim();
  if (!s || s === "-") return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v == null ? "" : String(v).trim());

function findHeader(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const cells = (rows[i] ?? []).map((c) => str(c).toUpperCase());
    if (cells.includes("LEDGER") && cells.includes("GROUP") && cells.includes("BALANCE")) {
      return i;
    }
  }
  return -1;
}

export async function parseMargLedgerBalanceFile(
  file: File,
): Promise<LedgerBalanceParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1, blankrows: false, defval: null,
  });

  const headerIdx = findHeader(raw);
  if (headerIdx < 0) {
    return {
      rows: [],
      warnings: ["Could not find header row with LEDGER / GROUP / BALANCE columns"],
      stats: { totalRows: 0, distinctGroups: 0, totalDebit: 0, totalCredit: 0, nonZeroRows: 0 },
    };
  }

  const rows: ParsedLedgerBalanceRow[] = [];
  const warnings: string[] = [];
  const groups = new Set<string>();
  let totalDr = 0, totalCr = 0, nonZero = 0;

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i] ?? [];
    const ledgerName = str(r[1]);
    const groupName = str(r[2]);
    if (!ledgerName) continue;
    // Skip footer/summary rows
    if (/^total/i.test(ledgerName) || /^grand/i.test(ledgerName)) continue;

    const row: ParsedLedgerBalanceRow = {
      serial: str(r[0]),
      ledgerName,
      groupName,
      opening: num(r[3]),
      debit: num(r[4]),
      credit: num(r[5]),
      balance: num(r[6]),
    };
    if (groupName) groups.add(groupName.toUpperCase());
    if (row.balance !== 0) nonZero++;
    if (row.balance > 0) totalDr += row.balance;
    else totalCr += -row.balance;
    rows.push(row);
  }

  return {
    rows, warnings,
    stats: {
      totalRows: rows.length,
      distinctGroups: groups.size,
      totalDebit: Math.round(totalDr * 100) / 100,
      totalCredit: Math.round(totalCr * 100) / 100,
      nonZeroRows: nonZero,
    },
  };
}

/** Map a MARG group name to our ledger_group_type enum. */
export function mapGroupType(marGroupName: string): string {
  const g = marGroupName.toUpperCase();
  if (/SUNDRY\s+DEBTOR/.test(g)) return "sundry_debtors";
  if (/SUNDRY\s+CREDITOR/.test(g)) return "sundry_creditors";
  if (/CASH-IN-HAND|CASH IN HAND|\bCASH\b/.test(g)) return "cash";
  if (/\bBANK\b/.test(g)) return "bank";
  if (/\bTAX\b|GST|CGST|SGST|IGST|CESS|DUTY|DUTIES|EXCISE/.test(g)) return "tax";
  if (/LOAN|BORROW/.test(g)) return "loan";
  if (/INVESTMENT/.test(g)) return "investment";
  if (/CAPITAL/.test(g)) return "capital";
  if (/SALES/.test(g)) return "income";
  if (/PURCHASE|EXPENSE/.test(g)) return "expenses";
  if (/INCOME|REVENUE/.test(g)) return "income";
  if (/CURRENT\s+ASSET|FIXED\s+ASSET|DEPOSIT/.test(g)) return "assets";
  if (/LIABILIT|PROVISION|PAYABLE/.test(g)) return "liabilities";
  return "other";
}
