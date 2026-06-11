// GST Filing types

export interface GSTPeriod {
  from: string; // ISO date YYYY-MM-DD
  to: string;
  label: string; // e.g. "Mar 2026" or "Q4 2025-26"
  fpLabel: string; // e.g. "032026" used in GSTN JSON
  year: number;
  month?: number; // 1-12
  quarter?: number; // 1-4
  type: "monthly" | "quarterly";
}

export interface CompanyGstInfo {
  gstin: string;
  legal_name: string;
  state_code: string;
  state_name: string;
}

export interface InvoiceItem {
  hsn: string;
  description: string;
  uqc: string;
  qty: number;
  rate: number; // gst %
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  invoice_value: number;
}

export interface InvoiceBucket {
  doc_no: string;
  doc_date: string; // YYYY-MM-DD
  doc_value: number; // gross incl tax
  pos: string; // state code
  is_interstate: boolean;
  reverse_charge: "Y" | "N";
  party_gstin?: string;
  party_name?: string;
  items: InvoiceItem[];
}

export interface RateBucket {
  rate: number;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  count: number;
}

export interface HSNRow {
  hsn: string;
  description: string;
  uqc: string;
  qty: number;
  rate: number;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  total: number;
}

export interface GSTR1Report {
  period: GSTPeriod;
  company: CompanyGstInfo;
  b2b: InvoiceBucket[]; // registered
  b2cl: InvoiceBucket[]; // unreg, interstate, > 2.5L
  b2cs: Array<RateBucket & { pos: string; is_interstate: boolean }>;
  cdnr: InvoiceBucket[]; // notes to registered
  cdnur: InvoiceBucket[]; // notes to unregistered
  hsn: HSNRow[];
  docs: Array<{ from: string; to: string; total: number; cancelled: number; net: number; type: string }>;
  totals: {
    invoice_count: number;
    taxable: number;
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
    invoice_value: number;
  };
}

export interface GSTR3BReport {
  period: GSTPeriod;
  company: CompanyGstInfo;
  outward: { taxable: number; igst: number; cgst: number; sgst: number; cess: number };
  itc: { igst: number; cgst: number; sgst: number; cess: number };
  inward_nil_exempt: number;
  inward_non_gst: number;
  net_payable: { igst: number; cgst: number; sgst: number; cess: number };
}

export interface PurchaseRegisterReport {
  period: GSTPeriod;
  company: CompanyGstInfo;
  invoices: InvoiceBucket[];
  byRate: RateBucket[];
  totals: {
    invoice_count: number;
    taxable: number;
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
    invoice_value: number;
  };
}

export interface HSNSummaryReport {
  period: GSTPeriod;
  company: CompanyGstInfo;
  outward: HSNRow[];
  inward: HSNRow[];
}
