import * as XLSX from "xlsx";

/**
 * Parser for MARG "Party Master" export (partymst_XX.xls).
 * Row 0 = header names: code | type | ledger | city | group | name | address1 | address2 | address3
 *                       pin | email | site | contact | phone1 | phone2 | mobile | resi | fax |
 *                       licence | tin | stno | panno | mr | area | ... | crdays | cramount | ...
 * Row 1..N = one party per row. `ledger` is the party's ledger/account name (usually same as `name`
 * in the store; `name` sometimes carries the email/contact string). `group` classifies whether the
 * party is a SUPPLIER, CUSTOMER, or other ledger.
 */

export type PartyKind = "supplier" | "customer" | "other";

export interface ParsedParty {
  code: string;
  kind: PartyKind;
  group: string;
  ledger_name: string;
  display_name: string;
  city: string | null;
  address: string | null;
  pin: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  contact_person: string | null;
  gst_number: string | null;
  pan_number: string | null;
  drug_license: string | null;
  credit_days: number | null;
  credit_limit: number | null;
  raw: Record<string, string>;
}

export interface PartyParseResult {
  parties: ParsedParty[];
  stats: {
    total: number;
    suppliers: number;
    customers: number;
    others: number;
    withPhone: number;
    withGst: number;
    withEmail: number;
  };
  warnings: string[];
}

const clean = (v: unknown): string => {
  if (v == null) return "";
  const s = String(v).trim();
  return s;
};

const firstNonEmpty = (...xs: string[]): string | null => {
  for (const x of xs) if (x && x.trim()) return x.trim();
  return null;
};

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function classify(group: string): PartyKind {
  const g = group.toUpperCase();
  if (g.includes("SUPPLIER") || g.includes("CREDITOR")) return "supplier";
  if (g.includes("CUSTOMER") || g.includes("DEBTOR")) return "customer";
  return "other";
}

function joinAddress(a1: string, a2: string, a3: string, city: string): string | null {
  const parts = [a1, a2, a3, city].map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

function parseNumber(s: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function parseMargPartyMasterFile(file: File): Promise<PartyParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null });
  if (rows.length < 2) {
    return { parties: [], stats: { total: 0, suppliers: 0, customers: 0, others: 0, withPhone: 0, withGst: 0, withEmail: 0 }, warnings: ["Empty file"] };
  }

  const header = (rows[0] as unknown[]).map(v => clean(v).toLowerCase());
  const col = (name: string) => header.indexOf(name);

  const idx = {
    code: col("code"),
    type: col("type"),
    ledger: col("ledger"),
    city: col("city"),
    group: col("group"),
    name: col("name"),
    address1: col("address1"),
    address2: col("address2"),
    address3: col("address3"),
    pin: col("pin"),
    email: col("email"),
    contact: col("contact"),
    phone1: col("phone1"),
    phone2: col("phone2"),
    mobile: col("mobile"),
    licence: col("licence"),
    tin: col("tin"),
    panno: col("panno"),
    crdays: col("crdays"),
    cramount: col("cramount"),
  };

  const get = (row: unknown[], i: number) => (i >= 0 ? clean(row[i]) : "");

  const parties: ParsedParty[] = [];
  const warnings: string[] = [];
  const stats = { total: 0, suppliers: 0, customers: 0, others: 0, withPhone: 0, withGst: 0, withEmail: 0 };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const ledger = get(row, idx.ledger);
    if (!ledger) continue;

    const group = get(row, idx.group);
    const kind = classify(group);

    const nameCol = get(row, idx.name);
    const displayName = ledger; // ledger column is the authoritative party name in MARG

    const emailFromNameCol = looksLikeEmail(nameCol) ? nameCol : "";
    const emailDirect = get(row, idx.email);
    const email = firstNonEmpty(emailDirect, emailFromNameCol);

    const mobile = firstNonEmpty(get(row, idx.mobile));
    const phone1 = firstNonEmpty(get(row, idx.phone1), get(row, idx.phone2));
    const phone = mobile ?? phone1;

    const contactRaw = firstNonEmpty(get(row, idx.contact));
    // MARG sometimes stores "Mr." in contact column; strip that.
    const contact_person =
      contactRaw && /^(mr\.?|mrs\.?|ms\.?|dr\.?)$/i.test(contactRaw) ? null : contactRaw;

    const address = joinAddress(
      get(row, idx.address1),
      get(row, idx.address2),
      get(row, idx.address3),
      get(row, idx.city),
    );

    const gst_number = firstNonEmpty(get(row, idx.tin));
    const pan_number = firstNonEmpty(get(row, idx.panno));
    const drug_license = firstNonEmpty(get(row, idx.licence));
    const city = firstNonEmpty(get(row, idx.city));
    const pin = firstNonEmpty(get(row, idx.pin));
    const credit_days = parseNumber(get(row, idx.crdays));
    const credit_limit = parseNumber(get(row, idx.cramount));

    parties.push({
      code: get(row, idx.code) || "",
      kind,
      group,
      ledger_name: ledger,
      display_name: displayName,
      city,
      address,
      pin,
      email,
      phone,
      mobile,
      contact_person,
      gst_number,
      pan_number,
      drug_license,
      credit_days,
      credit_limit,
      raw: {},
    });

    stats.total++;
    if (kind === "supplier") stats.suppliers++;
    else if (kind === "customer") stats.customers++;
    else stats.others++;
    if (phone) stats.withPhone++;
    if (email) stats.withEmail++;
    if (gst_number) stats.withGst++;
  }

  return { parties, stats, warnings };
}
