import { supabase } from "@/integrations/supabase/client";
import type {
  GSTPeriod,
  CompanyGstInfo,
  GSTR1Report,
  GSTR3BReport,
  PurchaseRegisterReport,
  HSNSummaryReport,
  InvoiceBucket,
  InvoiceItem,
  RateBucket,
  HSNRow,
} from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

interface BuildOptions {
  companyId: string;
  period: GSTPeriod;
  company: CompanyGstInfo;
  gstInclusive?: boolean;
}

// Compute taxable/tax from raw item line
function lineCompute(it: {
  quantity: number; unit_price: number; gst_percentage: number;
  discount_percentage?: number | null; total_price?: number | null;
}, inclusive: boolean, isInterstate: boolean) {
  const qty = Number(it.quantity) || 0;
  const price = Number(it.unit_price) || 0;
  const rate = Number(it.gst_percentage) || 0;
  const disc = Number(it.discount_percentage) || 0;
  const gross = qty * price * (1 - disc / 100);
  let taxable: number;
  if (inclusive) {
    taxable = gross / (1 + rate / 100);
  } else {
    taxable = gross;
  }
  const tax = taxable * (rate / 100);
  const igst = isInterstate ? tax : 0;
  const cgst = isInterstate ? 0 : tax / 2;
  const sgst = isInterstate ? 0 : tax / 2;
  return { taxable, igst, cgst, sgst, rate, qty, total: taxable + tax };
}

function emptyRate(rate: number): RateBucket {
  return { rate, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, count: 0 };
}

function emptyHsn(hsn: string, desc: string, uqc: string, rate: number): HSNRow {
  return { hsn, description: desc, uqc, qty: 0, rate, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 };
}

// ─────────────────────────────────────────── GSTR-1 ───────────────────────────────────────────

export async function buildGSTR1(opts: BuildOptions): Promise<GSTR1Report> {
  const { companyId, period, company, gstInclusive = false } = opts;

  // Fetch sales orders in period
  const { data: orders, error: oErr } = await supabase
    .from("sales_orders")
    .select(`
      id, invoice_number, sale_date, status, customer_name, customer_gstin,
      place_of_supply, is_interstate, total_amount,
      sales_order_items (
        quantity, unit_price, gst_percentage, discount_percentage,
        product_id, products(name, hsn_code, unit)
      )
    `)
    .eq("company_id", companyId)
    .gte("sale_date", period.from)
    .lte("sale_date", period.to)
    .order("sale_date");
  if (oErr) throw oErr;

  // Credit notes in period
  const { data: cnotes, error: cnErr } = await supabase
    .from("credit_notes")
    .select(`
      id, credit_note_number, created_at, original_invoice_number, customer_name,
      customer_gstin, place_of_supply, is_interstate, total_amount, note_type,
      credit_note_items (
        quantity, unit_price, gst_percentage, discount_percentage, product_name,
        product_id, products(name, hsn_code, unit)
      )
    `)
    .eq("company_id", companyId)
    .gte("created_at", period.from)
    .lte("created_at", period.to + "T23:59:59");
  if (cnErr) throw cnErr;

  const companyState = company.state_code;

  const b2b: InvoiceBucket[] = [];
  const b2cl: InvoiceBucket[] = [];
  const b2csMap = new Map<string, RateBucket & { pos: string; is_interstate: boolean }>();
  const cdnr: InvoiceBucket[] = [];
  const cdnur: InvoiceBucket[] = [];
  const hsnMap = new Map<string, HSNRow>();
  let totals = { invoice_count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoice_value: 0 };

  // Doc series accumulator
  const seriesMap = new Map<string, { from: string; to: string; total: number; cancelled: number }>();

  for (const o of orders ?? []) {
    if (!o.invoice_number) continue;
    const isCancelled = o.status === "cancelled";
    const pos = o.place_of_supply || companyState;
    const interstate = !!o.is_interstate || (pos && pos !== companyState);
    const items: InvoiceItem[] = [];
    let invTaxable = 0, invIgst = 0, invCgst = 0, invSgst = 0;
    for (const it of (o.sales_order_items ?? [])) {
      const c = lineCompute(it, gstInclusive, !!interstate);
      const hsn = it.products?.hsn_code || "0000";
      const uqc = uqcFromUnit(it.products?.unit);
      items.push({
        hsn, description: it.products?.name || "-", uqc,
        qty: c.qty, rate: c.rate,
        taxable: r2(c.taxable), igst: r2(c.igst), cgst: r2(c.cgst), sgst: r2(c.sgst), cess: 0,
        invoice_value: r2(c.total),
      });
      invTaxable += c.taxable; invIgst += c.igst; invCgst += c.cgst; invSgst += c.sgst;
      // HSN
      const hk = `${hsn}|${c.rate}`;
      if (!hsnMap.has(hk)) hsnMap.set(hk, emptyHsn(hsn, it.products?.name || "-", uqc, c.rate));
      const h = hsnMap.get(hk)!;
      h.qty += c.qty; h.taxable += c.taxable; h.igst += c.igst; h.cgst += c.cgst; h.sgst += c.sgst;
      h.total += c.total;
    }
    const invVal = invTaxable + invIgst + invCgst + invSgst;
    const bucket: InvoiceBucket = {
      doc_no: o.invoice_number,
      doc_date: o.sale_date,
      doc_value: r2(invVal),
      pos: pos || "",
      is_interstate: !!interstate,
      reverse_charge: "N",
      party_gstin: o.customer_gstin || undefined,
      party_name: o.customer_name || undefined,
      items,
    };

    // Track doc series
    const seriesKey = seriesPrefix(o.invoice_number);
    if (!seriesMap.has(seriesKey)) seriesMap.set(seriesKey, { from: o.invoice_number, to: o.invoice_number, total: 0, cancelled: 0 });
    const s = seriesMap.get(seriesKey)!;
    s.total += 1;
    if (isCancelled) s.cancelled += 1;
    if (o.invoice_number < s.from) s.from = o.invoice_number;
    if (o.invoice_number > s.to) s.to = o.invoice_number;

    if (isCancelled) continue;

    if (o.customer_gstin && o.customer_gstin.trim().length >= 15) {
      b2b.push(bucket);
    } else if (interstate && invVal > 250000) {
      b2cl.push(bucket);
    } else {
      // B2CS rate-wise
      for (const it of items) {
        const k = `${it.rate}|${pos}|${interstate ? "I" : "L"}`;
        if (!b2csMap.has(k)) b2csMap.set(k, { ...emptyRate(it.rate), pos: pos || "", is_interstate: !!interstate });
        const r = b2csMap.get(k)!;
        r.taxable += it.taxable; r.igst += it.igst; r.cgst += it.cgst; r.sgst += it.sgst; r.count += 1;
      }
    }
    totals.invoice_count += 1;
    totals.taxable += invTaxable;
    totals.igst += invIgst; totals.cgst += invCgst; totals.sgst += invSgst;
    totals.invoice_value += invVal;
  }

  for (const cn of cnotes ?? []) {
    const pos = cn.place_of_supply || companyState;
    const interstate = !!cn.is_interstate || (pos && pos !== companyState);
    const items: InvoiceItem[] = [];
    let invTaxable = 0, invIgst = 0, invCgst = 0, invSgst = 0;
    for (const it of (cn.credit_note_items ?? [])) {
      const c = lineCompute(it, gstInclusive, !!interstate);
      const hsn = it.products?.hsn_code || "0000";
      const uqc = uqcFromUnit(it.products?.unit);
      items.push({
        hsn, description: it.product_name || it.products?.name || "-", uqc,
        qty: c.qty, rate: c.rate,
        taxable: r2(c.taxable), igst: r2(c.igst), cgst: r2(c.cgst), sgst: r2(c.sgst), cess: 0,
        invoice_value: r2(c.total),
      });
      invTaxable += c.taxable; invIgst += c.igst; invCgst += c.cgst; invSgst += c.sgst;
    }
    const bucket: InvoiceBucket = {
      doc_no: cn.credit_note_number,
      doc_date: (cn.created_at || "").substring(0, 10),
      doc_value: r2(invTaxable + invIgst + invCgst + invSgst),
      pos: pos || "",
      is_interstate: !!interstate,
      reverse_charge: "N",
      party_gstin: cn.customer_gstin || undefined,
      party_name: cn.customer_name || undefined,
      items,
    };
    if (cn.customer_gstin && cn.customer_gstin.trim().length >= 15) cdnr.push(bucket);
    else cdnur.push(bucket);
  }

  const hsn = Array.from(hsnMap.values()).map((h) => ({
    ...h,
    qty: r2(h.qty), taxable: r2(h.taxable), igst: r2(h.igst), cgst: r2(h.cgst), sgst: r2(h.sgst), total: r2(h.total),
  }));
  const b2cs = Array.from(b2csMap.values()).map((r) => ({
    ...r, taxable: r2(r.taxable), igst: r2(r.igst), cgst: r2(r.cgst), sgst: r2(r.sgst),
  }));
  const docs = Array.from(seriesMap.entries()).map(([type, s]) => ({
    type, from: s.from, to: s.to, total: s.total, cancelled: s.cancelled, net: s.total - s.cancelled,
  }));

  totals = {
    invoice_count: totals.invoice_count,
    taxable: r2(totals.taxable),
    igst: r2(totals.igst), cgst: r2(totals.cgst), sgst: r2(totals.sgst), cess: 0,
    invoice_value: r2(totals.invoice_value),
  };

  return { period, company, b2b, b2cl, b2cs, cdnr, cdnur, hsn, docs, totals };
}

// ─────────────────────────────────────────── Purchase Register ───────────────────────────────────────────

export async function buildPurchaseRegister(opts: BuildOptions): Promise<PurchaseRegisterReport> {
  const { companyId, period, company, gstInclusive = false } = opts;
  const { data: orders, error } = await supabase
    .from("purchase_orders")
    .select(`
      id, order_number, order_date, status, supplier_id, supplier_gstin,
      supplier_invoice_number, supplier_invoice_date,
      place_of_supply, is_interstate,
      suppliers(name, gst_number, state_code),
      purchase_order_items (
        quantity, unit_price, gst_percentage, discount_percentage,
        products(name, hsn_code, unit)
      )
    `)
    .eq("company_id", companyId)
    .gte("order_date", period.from)
    .lte("order_date", period.to)
    .order("order_date");
  if (error) throw error;

  const companyState = company.state_code;
  const invoices: InvoiceBucket[] = [];
  const rateMap = new Map<number, RateBucket>();
  let totals = { invoice_count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoice_value: 0 };

  for (const o of orders ?? []) {
    if (o.status === "cancelled") continue;
    const supplierGstin = o.supplier_gstin || o.suppliers?.gst_number || "";
    const supplierState = supplierGstin ? supplierGstin.substring(0, 2) : (o.suppliers?.state_code || companyState);
    const pos = o.place_of_supply || companyState;
    const interstate = !!o.is_interstate || (supplierState && supplierState !== companyState);
    const items: InvoiceItem[] = [];
    let invTaxable = 0, invIgst = 0, invCgst = 0, invSgst = 0;
    for (const it of (o.purchase_order_items ?? [])) {
      const c = lineCompute(it, gstInclusive, !!interstate);
      items.push({
        hsn: it.products?.hsn_code || "0000",
        description: it.products?.name || "-",
        uqc: uqcFromUnit(it.products?.unit),
        qty: c.qty, rate: c.rate,
        taxable: r2(c.taxable), igst: r2(c.igst), cgst: r2(c.cgst), sgst: r2(c.sgst), cess: 0,
        invoice_value: r2(c.total),
      });
      invTaxable += c.taxable; invIgst += c.igst; invCgst += c.cgst; invSgst += c.sgst;
      if (!rateMap.has(c.rate)) rateMap.set(c.rate, emptyRate(c.rate));
      const r = rateMap.get(c.rate)!;
      r.taxable += c.taxable; r.igst += c.igst; r.cgst += c.cgst; r.sgst += c.sgst; r.count += 1;
    }
    const invVal = invTaxable + invIgst + invCgst + invSgst;
    invoices.push({
      doc_no: o.supplier_invoice_number || o.order_number,
      doc_date: o.supplier_invoice_date || o.order_date,
      doc_value: r2(invVal),
      pos: pos || "",
      is_interstate: !!interstate,
      reverse_charge: "N",
      party_gstin: supplierGstin || undefined,
      party_name: o.suppliers?.name || undefined,
      items,
    });
    totals.invoice_count += 1;
    totals.taxable += invTaxable; totals.igst += invIgst; totals.cgst += invCgst; totals.sgst += invSgst;
    totals.invoice_value += invVal;
  }

  const byRate = Array.from(rateMap.values()).map((r) => ({
    ...r, taxable: r2(r.taxable), igst: r2(r.igst), cgst: r2(r.cgst), sgst: r2(r.sgst),
  })).sort((a, b) => a.rate - b.rate);

  totals = {
    invoice_count: totals.invoice_count,
    taxable: r2(totals.taxable), igst: r2(totals.igst), cgst: r2(totals.cgst), sgst: r2(totals.sgst), cess: 0,
    invoice_value: r2(totals.invoice_value),
  };

  return { period, company, invoices, byRate, totals };
}

// ─────────────────────────────────────────── GSTR-3B ───────────────────────────────────────────

export async function buildGSTR3B(opts: BuildOptions): Promise<GSTR3BReport> {
  const [g1, pr] = await Promise.all([buildGSTR1(opts), buildPurchaseRegister(opts)]);

  const out = { taxable: g1.totals.taxable, igst: g1.totals.igst, cgst: g1.totals.cgst, sgst: g1.totals.sgst, cess: g1.totals.cess };
  // Subtract credit notes
  for (const cn of [...g1.cdnr, ...g1.cdnur]) {
    for (const it of cn.items) {
      out.taxable -= it.taxable; out.igst -= it.igst; out.cgst -= it.cgst; out.sgst -= it.sgst;
    }
  }
  out.taxable = r2(out.taxable); out.igst = r2(out.igst); out.cgst = r2(out.cgst); out.sgst = r2(out.sgst);

  const itc = { igst: pr.totals.igst, cgst: pr.totals.cgst, sgst: pr.totals.sgst, cess: 0 };
  const net_payable = {
    igst: r2(Math.max(0, out.igst - itc.igst)),
    cgst: r2(Math.max(0, out.cgst - itc.cgst)),
    sgst: r2(Math.max(0, out.sgst - itc.sgst)),
    cess: 0,
  };
  return {
    period: opts.period, company: opts.company,
    outward: out, itc, inward_nil_exempt: 0, inward_non_gst: 0, net_payable,
  };
}

// ─────────────────────────────────────────── HSN Summary ───────────────────────────────────────────

export async function buildHSNSummary(opts: BuildOptions): Promise<HSNSummaryReport> {
  const [g1, pr] = await Promise.all([buildGSTR1(opts), buildPurchaseRegister(opts)]);
  // outward already aggregated; aggregate inward similarly
  const inMap = new Map<string, HSNRow>();
  for (const inv of pr.invoices) {
    for (const it of inv.items) {
      const k = `${it.hsn}|${it.rate}`;
      if (!inMap.has(k)) inMap.set(k, emptyHsn(it.hsn, it.description, it.uqc, it.rate));
      const h = inMap.get(k)!;
      h.qty += it.qty; h.taxable += it.taxable; h.igst += it.igst; h.cgst += it.cgst; h.sgst += it.sgst;
      h.total += it.invoice_value;
    }
  }
  const inward = Array.from(inMap.values()).map((h) => ({
    ...h, qty: r2(h.qty), taxable: r2(h.taxable), igst: r2(h.igst), cgst: r2(h.cgst), sgst: r2(h.sgst), total: r2(h.total),
  }));
  return { period: opts.period, company: opts.company, outward: g1.hsn, inward };
}

// ─── helpers ───
function uqcFromUnit(unit?: string | null): string {
  const u = (unit || "").toLowerCase();
  const map: Record<string, string> = {
    pcs: "PCS", strip: "PAC", bottle: "BTL", box: "BOX", tube: "TUB", vial: "VLS",
    amp: "AMP", kg: "KGS", liter: "LTR", meter: "MTR", dozen: "DOZ", pair: "PRS",
    set: "SET", carton: "CTN",
  };
  return map[u] || "NOS";
}

function seriesPrefix(invNo: string): string {
  // Strip trailing digits to get series prefix
  const m = invNo.match(/^(.*?)(\d+)$/);
  return m ? (m[1] || "INV") : invNo;
}
