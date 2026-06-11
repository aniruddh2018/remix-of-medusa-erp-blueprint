// GST report exporters: CSV, Excel (offline-utility-style), GSTN JSON, PDF
import * as XLSX from "xlsx";
import type {
  GSTR1Report, GSTR3BReport, PurchaseRegisterReport, HSNSummaryReport,
  InvoiceBucket, HSNRow,
} from "./types";

const f2 = (n: number) => (Number(n) || 0).toFixed(2);

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csv(rows: (string | number)[][]): string {
  return rows.map((r) =>
    r.map((c) => {
      const s = String(c ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
  ).join("\n");
}

// ════════════════════════════ CSV ════════════════════════════

export function exportGSTR1CSV(r: GSTR1Report) {
  const out: (string | number)[][] = [];
  out.push([`GSTR-1 — ${r.company.legal_name} (${r.company.gstin}) — ${r.period.label}`]);
  out.push([]);
  out.push(["B2B — Invoice-wise (Registered Customers)"]);
  out.push(["GSTIN/UIN of Recipient","Receiver Name","Invoice Number","Invoice Date","Invoice Value","Place Of Supply","Reverse Charge","Invoice Type","Rate","Taxable Value","Integrated Tax","Central Tax","State/UT Tax","Cess"]);
  for (const inv of r.b2b) for (const it of inv.items) {
    out.push([inv.party_gstin || "", inv.party_name || "", inv.doc_no, inv.doc_date, f2(inv.doc_value), inv.pos, inv.reverse_charge, "Regular", it.rate, f2(it.taxable), f2(it.igst), f2(it.cgst), f2(it.sgst), f2(it.cess)]);
  }
  out.push([]);
  out.push(["B2CL — Invoice-wise (Unregistered, Inter-state, > 2.5L)"]);
  out.push(["Invoice Number","Invoice Date","Invoice Value","Place Of Supply","Rate","Taxable Value","Integrated Tax","Cess"]);
  for (const inv of r.b2cl) for (const it of inv.items) {
    out.push([inv.doc_no, inv.doc_date, f2(inv.doc_value), inv.pos, it.rate, f2(it.taxable), f2(it.igst), f2(it.cess)]);
  }
  out.push([]);
  out.push(["B2CS — Rate-wise summary (Unregistered)"]);
  out.push(["Type","Place Of Supply","Rate","Taxable Value","Integrated Tax","Central Tax","State/UT Tax","Cess"]);
  for (const b of r.b2cs) {
    out.push([b.is_interstate ? "OE" : "OE", b.pos, b.rate, f2(b.taxable), f2(b.igst), f2(b.cgst), f2(b.sgst), f2(b.cess)]);
  }
  out.push([]);
  out.push(["CDNR — Credit/Debit Notes (Registered)"]);
  out.push(["GSTIN of Recipient","Receiver Name","Note Number","Note Date","Note Type","Note Value","Place Of Supply","Rate","Taxable Value","IGST","CGST","SGST"]);
  for (const inv of r.cdnr) for (const it of inv.items) {
    out.push([inv.party_gstin || "", inv.party_name || "", inv.doc_no, inv.doc_date, "C", f2(inv.doc_value), inv.pos, it.rate, f2(it.taxable), f2(it.igst), f2(it.cgst), f2(it.sgst)]);
  }
  out.push([]);
  out.push(["HSN Summary (Table 12)"]);
  out.push(["HSN","Description","UQC","Total Qty","Rate","Taxable Value","IGST","CGST","SGST","Cess","Total Value"]);
  for (const h of r.hsn) out.push([h.hsn, h.description, h.uqc, h.qty, h.rate, f2(h.taxable), f2(h.igst), f2(h.cgst), f2(h.sgst), f2(h.cess), f2(h.total)]);
  out.push([]);
  out.push(["Document Issued (Table 13)"]);
  out.push(["Series","From","To","Total","Cancelled","Net"]);
  for (const d of r.docs) out.push([d.type, d.from, d.to, d.total, d.cancelled, d.net]);

  downloadBlob(new Blob([csv(out)], { type: "text/csv;charset=utf-8" }), `GSTR1_${r.period.fpLabel}.csv`);
}

export function exportPurchaseRegisterCSV(r: PurchaseRegisterReport) {
  const out: (string | number)[][] = [];
  out.push([`Purchase Register — ${r.company.legal_name} (${r.company.gstin}) — ${r.period.label}`]);
  out.push([]);
  out.push(["Supplier GSTIN","Supplier Name","Invoice No","Invoice Date","Invoice Value","POS","Rate","Taxable","IGST","CGST","SGST","Cess"]);
  for (const inv of r.invoices) for (const it of inv.items) {
    out.push([inv.party_gstin || "", inv.party_name || "", inv.doc_no, inv.doc_date, f2(inv.doc_value), inv.pos, it.rate, f2(it.taxable), f2(it.igst), f2(it.cgst), f2(it.sgst), f2(it.cess)]);
  }
  out.push([]);
  out.push(["Rate-wise ITC Summary"]);
  out.push(["Rate","Taxable","IGST","CGST","SGST","Invoices"]);
  for (const b of r.byRate) out.push([b.rate, f2(b.taxable), f2(b.igst), f2(b.cgst), f2(b.sgst), b.count]);
  out.push([]);
  out.push(["TOTAL", "", "", "", f2(r.totals.invoice_value), "", "", f2(r.totals.taxable), f2(r.totals.igst), f2(r.totals.cgst), f2(r.totals.sgst), f2(r.totals.cess)]);

  downloadBlob(new Blob([csv(out)], { type: "text/csv;charset=utf-8" }), `PurchaseRegister_${r.period.fpLabel}.csv`);
}

export function exportGSTR3BCSV(r: GSTR3BReport) {
  const out: (string | number)[][] = [];
  out.push([`GSTR-3B Summary — ${r.company.legal_name} (${r.company.gstin}) — ${r.period.label}`]);
  out.push([]);
  out.push(["3.1 Details of Outward Supplies and inward supplies liable to reverse charge"]);
  out.push(["Nature of Supplies","Total Taxable Value","Integrated Tax","Central Tax","State/UT Tax","Cess"]);
  out.push(["(a) Outward taxable supplies (other than zero rated, nil rated and exempted)", f2(r.outward.taxable), f2(r.outward.igst), f2(r.outward.cgst), f2(r.outward.sgst), f2(r.outward.cess)]);
  out.push(["(b) Outward taxable supplies (zero rated)", "0.00","0.00","0.00","0.00","0.00"]);
  out.push(["(c) Other outward supplies (nil rated, exempted)","0.00","","","",""]);
  out.push(["(d) Inward supplies (liable to reverse charge)","0.00","0.00","0.00","0.00","0.00"]);
  out.push(["(e) Non-GST outward supplies","0.00","","","",""]);
  out.push([]);
  out.push(["4. Eligible ITC"]);
  out.push(["Details","Integrated Tax","Central Tax","State/UT Tax","Cess"]);
  out.push(["(A) ITC Available — (5) All other ITC", f2(r.itc.igst), f2(r.itc.cgst), f2(r.itc.sgst), f2(r.itc.cess)]);
  out.push(["(C) Net ITC Available (A) - (B)", f2(r.itc.igst), f2(r.itc.cgst), f2(r.itc.sgst), f2(r.itc.cess)]);
  out.push([]);
  out.push(["6.1 Payment of Tax"]);
  out.push(["Description","Tax Payable","Paid through ITC","Tax Paid in Cash"]);
  out.push(["Integrated Tax", f2(r.outward.igst), f2(Math.min(r.outward.igst, r.itc.igst)), f2(r.net_payable.igst)]);
  out.push(["Central Tax", f2(r.outward.cgst), f2(Math.min(r.outward.cgst, r.itc.cgst)), f2(r.net_payable.cgst)]);
  out.push(["State/UT Tax", f2(r.outward.sgst), f2(Math.min(r.outward.sgst, r.itc.sgst)), f2(r.net_payable.sgst)]);

  downloadBlob(new Blob([csv(out)], { type: "text/csv;charset=utf-8" }), `GSTR3B_${r.period.fpLabel}.csv`);
}

export function exportHSNCSV(r: HSNSummaryReport) {
  const out: (string | number)[][] = [];
  out.push([`HSN Summary — ${r.company.legal_name} (${r.company.gstin}) — ${r.period.label}`]);
  out.push([]);
  out.push(["OUTWARD (Sales)"]);
  out.push(["HSN","Description","UQC","Qty","Rate","Taxable","IGST","CGST","SGST","Cess","Total"]);
  for (const h of r.outward) out.push([h.hsn, h.description, h.uqc, h.qty, h.rate, f2(h.taxable), f2(h.igst), f2(h.cgst), f2(h.sgst), f2(h.cess), f2(h.total)]);
  out.push([]);
  out.push(["INWARD (Purchases)"]);
  out.push(["HSN","Description","UQC","Qty","Rate","Taxable","IGST","CGST","SGST","Cess","Total"]);
  for (const h of r.inward) out.push([h.hsn, h.description, h.uqc, h.qty, h.rate, f2(h.taxable), f2(h.igst), f2(h.cgst), f2(h.sgst), f2(h.cess), f2(h.total)]);
  downloadBlob(new Blob([csv(out)], { type: "text/csv;charset=utf-8" }), `HSN_Summary_${r.period.fpLabel}.csv`);
}

// ════════════════════════════ Excel (offline utility) ════════════════════════════

export function exportGSTR1Excel(r: GSTR1Report) {
  const wb = XLSX.utils.book_new();
  // b2b
  const b2bRows: any[][] = [["GSTIN/UIN of Recipient","Receiver Name","Invoice Number","Invoice Date","Invoice Value","Place Of Supply","Reverse Charge","Applicable % of Tax Rate","Invoice Type","E-Commerce GSTIN","Rate","Taxable Value","Cess Amount"]];
  for (const inv of r.b2b) for (const it of inv.items)
    b2bRows.push([inv.party_gstin || "", inv.party_name || "", inv.doc_no, inv.doc_date, +inv.doc_value.toFixed(2), inv.pos, inv.reverse_charge, "", "Regular", "", it.rate, +it.taxable.toFixed(2), +it.cess.toFixed(2)]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b2bRows), "b2b");

  const b2clRows: any[][] = [["Invoice Number","Invoice date","Invoice Value","Place Of Supply","Applicable % of Tax Rate","Rate","Taxable Value","Cess Amount","E-Commerce GSTIN"]];
  for (const inv of r.b2cl) for (const it of inv.items)
    b2clRows.push([inv.doc_no, inv.doc_date, +inv.doc_value.toFixed(2), inv.pos, "", it.rate, +it.taxable.toFixed(2), +it.cess.toFixed(2), ""]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b2clRows), "b2cl");

  const b2csRows: any[][] = [["Type","Place Of Supply","Applicable % of Tax Rate","Rate","Taxable Value","Cess Amount","E-Commerce GSTIN"]];
  for (const b of r.b2cs) b2csRows.push(["OE", b.pos, "", b.rate, +b.taxable.toFixed(2), +b.cess.toFixed(2), ""]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b2csRows), "b2cs");

  const cdnrRows: any[][] = [["GSTIN/UIN of Recipient","Receiver Name","Note Number","Note Date","Note Type","Place Of Supply","Reverse Charge","Note Supply Type","Note Value","Applicable % of Tax Rate","Rate","Taxable Value","Cess Amount"]];
  for (const inv of r.cdnr) for (const it of inv.items)
    cdnrRows.push([inv.party_gstin || "", inv.party_name || "", inv.doc_no, inv.doc_date, "C", inv.pos, "N", "Regular", +inv.doc_value.toFixed(2), "", it.rate, +it.taxable.toFixed(2), +it.cess.toFixed(2)]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cdnrRows), "cdnr");

  const cdnurRows: any[][] = [["UR Type","Note Number","Note Date","Note Type","Place Of Supply","Note Value","Applicable % of Tax Rate","Rate","Taxable Value","Cess Amount"]];
  for (const inv of r.cdnur) for (const it of inv.items)
    cdnurRows.push([inv.is_interstate && inv.doc_value > 250000 ? "B2CL" : "EXPWP", inv.doc_no, inv.doc_date, "C", inv.pos, +inv.doc_value.toFixed(2), "", it.rate, +it.taxable.toFixed(2), +it.cess.toFixed(2)]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cdnurRows), "cdnur");

  const hsnRows: any[][] = [["HSN","Description","UQC","Total Quantity","Total Value","Rate","Taxable Value","Integrated Tax Amount","Central Tax Amount","State/UT Tax Amount","Cess Amount"]];
  for (const h of r.hsn) hsnRows.push([h.hsn, h.description, h.uqc, h.qty, +h.total.toFixed(2), h.rate, +h.taxable.toFixed(2), +h.igst.toFixed(2), +h.cgst.toFixed(2), +h.sgst.toFixed(2), +h.cess.toFixed(2)]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hsnRows), "hsn");

  const docsRows: any[][] = [["Nature of Document","Sr. No. From","Sr. No. To","Total Number","Cancelled","Net Issued"]];
  for (const d of r.docs) docsRows.push(["Invoices for outward supply", d.from, d.to, d.total, d.cancelled, d.net]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(docsRows), "docs");

  XLSX.writeFile(wb, `GSTR1_${r.company.gstin}_${r.period.fpLabel}.xlsx`);
}

export function exportPurchaseRegisterExcel(r: PurchaseRegisterReport) {
  const wb = XLSX.utils.book_new();
  const rows: any[][] = [["Supplier GSTIN","Supplier Name","Invoice No","Invoice Date","Invoice Value","Place Of Supply","Rate","Taxable","IGST","CGST","SGST","Cess"]];
  for (const inv of r.invoices) for (const it of inv.items)
    rows.push([inv.party_gstin || "", inv.party_name || "", inv.doc_no, inv.doc_date, +inv.doc_value.toFixed(2), inv.pos, it.rate, +it.taxable.toFixed(2), +it.igst.toFixed(2), +it.cgst.toFixed(2), +it.sgst.toFixed(2), +it.cess.toFixed(2)]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Purchases");
  const rateRows: any[][] = [["Rate","Taxable","IGST","CGST","SGST","Invoices"]];
  for (const b of r.byRate) rateRows.push([b.rate, +b.taxable.toFixed(2), +b.igst.toFixed(2), +b.cgst.toFixed(2), +b.sgst.toFixed(2), b.count]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rateRows), "Rate Summary");
  XLSX.writeFile(wb, `PurchaseRegister_${r.period.fpLabel}.xlsx`);
}

export function exportGSTR3BExcel(r: GSTR3BReport) {
  const wb = XLSX.utils.book_new();
  const rows: any[][] = [
    [`GSTR-3B Summary — ${r.period.label}`],
    [`GSTIN: ${r.company.gstin}`, `Legal Name: ${r.company.legal_name}`],
    [],
    ["3.1 Outward supplies and inward reverse-charge"],
    ["Nature","Taxable","IGST","CGST","SGST","Cess"],
    ["(a) Outward taxable (other than zero/nil/exempt)", r.outward.taxable, r.outward.igst, r.outward.cgst, r.outward.sgst, r.outward.cess],
    [],
    ["4. Eligible ITC"],
    ["","IGST","CGST","SGST","Cess"],
    ["(A)(5) All other ITC", r.itc.igst, r.itc.cgst, r.itc.sgst, r.itc.cess],
    [],
    ["6.1 Payment of Tax"],
    ["Tax","Payable","Through ITC","Cash"],
    ["IGST", r.outward.igst, Math.min(r.outward.igst, r.itc.igst), r.net_payable.igst],
    ["CGST", r.outward.cgst, Math.min(r.outward.cgst, r.itc.cgst), r.net_payable.cgst],
    ["SGST", r.outward.sgst, Math.min(r.outward.sgst, r.itc.sgst), r.net_payable.sgst],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "GSTR-3B");
  XLSX.writeFile(wb, `GSTR3B_${r.period.fpLabel}.xlsx`);
}

export function exportHSNExcel(r: HSNSummaryReport) {
  const wb = XLSX.utils.book_new();
  const cols = ["HSN","Description","UQC","Qty","Rate","Taxable","IGST","CGST","SGST","Cess","Total"];
  const out: any[][] = [cols, ...r.outward.map((h) => [h.hsn, h.description, h.uqc, h.qty, h.rate, +h.taxable.toFixed(2), +h.igst.toFixed(2), +h.cgst.toFixed(2), +h.sgst.toFixed(2), +h.cess.toFixed(2), +h.total.toFixed(2)])];
  const inn: any[][] = [cols, ...r.inward.map((h) => [h.hsn, h.description, h.uqc, h.qty, h.rate, +h.taxable.toFixed(2), +h.igst.toFixed(2), +h.cgst.toFixed(2), +h.sgst.toFixed(2), +h.cess.toFixed(2), +h.total.toFixed(2)])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(out), "Outward HSN");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inn), "Inward HSN");
  XLSX.writeFile(wb, `HSN_Summary_${r.period.fpLabel}.xlsx`);
}

// ════════════════════════════ GSTN JSON (portal upload) ════════════════════════════

export function exportGSTR1JSON(r: GSTR1Report) {
  // Group b2b by gstin
  const b2bMap = new Map<string, any>();
  for (const inv of r.b2b) {
    if (!inv.party_gstin) continue;
    if (!b2bMap.has(inv.party_gstin)) b2bMap.set(inv.party_gstin, { ctin: inv.party_gstin, inv: [] });
    const itms = inv.items.map((it, i) => ({
      num: i + 1,
      itm_det: {
        txval: +it.taxable.toFixed(2),
        rt: it.rate,
        camt: +it.cgst.toFixed(2),
        samt: +it.sgst.toFixed(2),
        iamt: +it.igst.toFixed(2),
        csamt: +it.cess.toFixed(2),
      },
    }));
    b2bMap.get(inv.party_gstin).inv.push({
      inum: inv.doc_no,
      idt: ddmmyyyy(inv.doc_date),
      val: +inv.doc_value.toFixed(2),
      pos: inv.pos,
      rchrg: inv.reverse_charge,
      inv_typ: "R",
      itms,
    });
  }

  // b2cl grouped by POS
  const b2clMap = new Map<string, any>();
  for (const inv of r.b2cl) {
    if (!b2clMap.has(inv.pos)) b2clMap.set(inv.pos, { pos: inv.pos, inv: [] });
    const itms = inv.items.map((it, i) => ({
      num: i + 1,
      itm_det: { txval: +it.taxable.toFixed(2), rt: it.rate, iamt: +it.igst.toFixed(2), csamt: +it.cess.toFixed(2) },
    }));
    b2clMap.get(inv.pos).inv.push({
      inum: inv.doc_no, idt: ddmmyyyy(inv.doc_date), val: +inv.doc_value.toFixed(2), itms,
    });
  }

  const b2cs = r.b2cs.map((b) => ({
    sply_ty: b.is_interstate ? "INTER" : "INTRA",
    pos: b.pos,
    typ: "OE",
    txval: +b.taxable.toFixed(2),
    rt: b.rate,
    iamt: +b.igst.toFixed(2),
    camt: +b.cgst.toFixed(2),
    samt: +b.sgst.toFixed(2),
    csamt: +b.cess.toFixed(2),
  }));

  // cdnr grouped by gstin
  const cdnrMap = new Map<string, any>();
  for (const inv of r.cdnr) {
    if (!inv.party_gstin) continue;
    if (!cdnrMap.has(inv.party_gstin)) cdnrMap.set(inv.party_gstin, { ctin: inv.party_gstin, nt: [] });
    const itms = inv.items.map((it, i) => ({
      num: i + 1,
      itm_det: { txval: +it.taxable.toFixed(2), rt: it.rate, camt: +it.cgst.toFixed(2), samt: +it.sgst.toFixed(2), iamt: +it.igst.toFixed(2), csamt: 0 },
    }));
    cdnrMap.get(inv.party_gstin).nt.push({
      ntty: "C", nt_num: inv.doc_no, nt_dt: ddmmyyyy(inv.doc_date),
      p_gst: "N", rsn: "01", val: +inv.doc_value.toFixed(2), pos: inv.pos, rchrg: "N", inv_typ: "R", itms,
    });
  }

  const hsn = {
    data: r.hsn.map((h, i) => ({
      num: i + 1,
      hsn_sc: h.hsn,
      desc: h.description,
      uqc: h.uqc,
      qty: +h.qty.toFixed(2),
      val: +h.total.toFixed(2),
      txval: +h.taxable.toFixed(2),
      iamt: +h.igst.toFixed(2),
      camt: +h.cgst.toFixed(2),
      samt: +h.sgst.toFixed(2),
      csamt: +h.cess.toFixed(2),
      rt: h.rate,
    })),
  };

  const doc_issue = {
    doc_det: [{
      doc_num: 1, doc_typ: "Invoices for outward supply",
      docs: r.docs.map((d, i) => ({ num: i + 1, from: d.from, to: d.to, totnum: d.total, cancel: d.cancelled, net_issue: d.net })),
    }],
  };

  const payload = {
    gstin: r.company.gstin,
    fp: r.period.fpLabel,
    gt: +r.totals.invoice_value.toFixed(2),
    cur_gt: +r.totals.invoice_value.toFixed(2),
    b2b: Array.from(b2bMap.values()),
    b2cl: Array.from(b2clMap.values()),
    b2cs,
    cdnr: Array.from(cdnrMap.values()),
    hsn,
    doc_issue,
  };

  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `GSTR1_${r.company.gstin}_${r.period.fpLabel}.json`);
}

export function exportGSTR3BJSON(r: GSTR3BReport) {
  const payload = {
    gstin: r.company.gstin,
    ret_period: r.period.fpLabel,
    sup_details: {
      osup_det: { txval: r.outward.taxable, iamt: r.outward.igst, camt: r.outward.cgst, samt: r.outward.sgst, csamt: r.outward.cess },
      osup_zero: { txval: 0, iamt: 0, csamt: 0 },
      osup_nil_exmp: { txval: 0 },
      isup_rev: { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 },
      osup_nongst: { txval: 0 },
    },
    inter_sup: { unreg_details: [], comp_details: [], uin_details: [] },
    itc_elg: {
      itc_avl: [{ ty: "OTH", iamt: r.itc.igst, camt: r.itc.cgst, samt: r.itc.sgst, csamt: r.itc.cess }],
      itc_rev: [],
      itc_net: { iamt: r.itc.igst, camt: r.itc.cgst, samt: r.itc.sgst, csamt: r.itc.cess },
      itc_inelg: [],
    },
    inward_sup: { isup_details: [{ ty: "GST", inter: 0, intra: 0 }, { ty: "NONGST", inter: 0, intra: 0 }] },
    intr_ltfee: { intr_details: { iamt: 0, camt: 0, samt: 0, csamt: 0 }, ltfee_details: { camt: 0, samt: 0 } },
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `GSTR3B_${r.company.gstin}_${r.period.fpLabel}.json`);
}

// ════════════════════════════ PDF (print window) ════════════════════════════

const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function openPdfWindow(title: string, html: string) {
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) { alert("Pop-up blocked. Please allow pop-ups."); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: Arial, sans-serif; font-size: 10px; color: #000; margin: 0; }
    h1 { text-align:center; font-size: 16px; margin: 0 0 4px; }
    h2 { text-align:center; font-size: 11px; margin: 0 0 12px; font-weight: normal; color: #444; }
    h3 { font-size: 12px; margin: 16px 0 4px; background: #eee; padding: 4px 6px; border-left: 3px solid #555; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { border: 1px solid #999; padding: 3px 5px; font-size: 9px; }
    th { background: #f4f4f4; text-align: left; }
    .num { text-align: right; font-family: monospace; }
    .no-print { padding: 8px; background: #f0f0f0; text-align: center; }
    .no-print button { padding: 6px 16px; margin: 0 4px; cursor: pointer; }
    @media print { .no-print { display: none; } }
  </style></head><body>
  <div class="no-print"><button onclick="window.print()">🖨️ Print / Save PDF</button><button onclick="window.close()">Close</button></div>
  ${html}
  </body></html>`);
  w.document.close();
}

function header(title: string, r: { company: { legal_name: string; gstin: string; state_name: string }; period: { label: string } }) {
  return `<h1>${esc(title)}</h1>
  <h2><strong>${esc(r.company.legal_name)}</strong> | GSTIN: <strong>${esc(r.company.gstin)}</strong> | ${esc(r.company.state_name)} | Period: <strong>${esc(r.period.label)}</strong></h2>`;
}

export function exportGSTR1PDF(r: GSTR1Report) {
  const sec = (title: string, rows: string) => `<h3>${esc(title)}</h3>${rows}`;
  const b2bTable = `<table><thead><tr><th>GSTIN</th><th>Receiver</th><th>Invoice #</th><th>Date</th><th class="num">Value</th><th>POS</th><th class="num">Rate</th><th class="num">Taxable</th><th class="num">IGST</th><th class="num">CGST</th><th class="num">SGST</th></tr></thead><tbody>${
    r.b2b.flatMap(inv => inv.items.map(it => `<tr><td>${esc(inv.party_gstin)}</td><td>${esc(inv.party_name)}</td><td>${esc(inv.doc_no)}</td><td>${esc(inv.doc_date)}</td><td class="num">${f2(inv.doc_value)}</td><td>${esc(inv.pos)}</td><td class="num">${it.rate}%</td><td class="num">${f2(it.taxable)}</td><td class="num">${f2(it.igst)}</td><td class="num">${f2(it.cgst)}</td><td class="num">${f2(it.sgst)}</td></tr>`)).join("") || `<tr><td colspan="11" style="text-align:center;color:#888">No B2B invoices</td></tr>`
  }</tbody></table>`;
  const b2csTable = `<table><thead><tr><th>POS</th><th>Type</th><th class="num">Rate</th><th class="num">Taxable</th><th class="num">IGST</th><th class="num">CGST</th><th class="num">SGST</th></tr></thead><tbody>${
    r.b2cs.map(b => `<tr><td>${esc(b.pos)}</td><td>${b.is_interstate ? "Inter" : "Intra"}</td><td class="num">${b.rate}%</td><td class="num">${f2(b.taxable)}</td><td class="num">${f2(b.igst)}</td><td class="num">${f2(b.cgst)}</td><td class="num">${f2(b.sgst)}</td></tr>`).join("") || `<tr><td colspan="7" style="text-align:center;color:#888">No B2C summary</td></tr>`
  }</tbody></table>`;
  const hsnTable = `<table><thead><tr><th>HSN</th><th>Description</th><th>UQC</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Taxable</th><th class="num">IGST</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">Total</th></tr></thead><tbody>${
    r.hsn.map(h => `<tr><td>${esc(h.hsn)}</td><td>${esc(h.description)}</td><td>${esc(h.uqc)}</td><td class="num">${h.qty}</td><td class="num">${h.rate}%</td><td class="num">${f2(h.taxable)}</td><td class="num">${f2(h.igst)}</td><td class="num">${f2(h.cgst)}</td><td class="num">${f2(h.sgst)}</td><td class="num">${f2(h.total)}</td></tr>`).join("")
  }</tbody></table>`;
  const totals = `<table><tr><th>Invoices</th><th class="num">Taxable</th><th class="num">IGST</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">Invoice Value</th></tr><tr><td>${r.totals.invoice_count}</td><td class="num">${f2(r.totals.taxable)}</td><td class="num">${f2(r.totals.igst)}</td><td class="num">${f2(r.totals.cgst)}</td><td class="num">${f2(r.totals.sgst)}</td><td class="num">${f2(r.totals.invoice_value)}</td></tr></table>`;
  openPdfWindow(`GSTR-1 ${r.period.label}`, header("GSTR-1 — Outward Supplies", r) + sec("Totals", totals) + sec("B2B — Registered", b2bTable) + sec("B2CS — Consumer Summary", b2csTable) + sec("HSN Summary (Table 12)", hsnTable));
}

export function exportGSTR3BPDF(r: GSTR3BReport) {
  const html = `
  <h3>3.1 Outward supplies and inward supplies liable to reverse charge</h3>
  <table><thead><tr><th>Nature</th><th class="num">Taxable</th><th class="num">IGST</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">Cess</th></tr></thead><tbody>
    <tr><td>(a) Outward taxable (other than zero/nil/exempt)</td><td class="num">${f2(r.outward.taxable)}</td><td class="num">${f2(r.outward.igst)}</td><td class="num">${f2(r.outward.cgst)}</td><td class="num">${f2(r.outward.sgst)}</td><td class="num">${f2(r.outward.cess)}</td></tr>
    <tr><td>(b) Outward taxable (zero-rated)</td><td class="num">0.00</td><td class="num">0.00</td><td class="num">—</td><td class="num">—</td><td class="num">0.00</td></tr>
    <tr><td>(c) Other outward (nil/exempt)</td><td class="num">0.00</td><td colspan="4" class="num">—</td></tr>
    <tr><td>(d) Inward supplies (reverse charge)</td><td class="num">0.00</td><td class="num">0.00</td><td class="num">0.00</td><td class="num">0.00</td><td class="num">0.00</td></tr>
    <tr><td>(e) Non-GST outward</td><td class="num">0.00</td><td colspan="4" class="num">—</td></tr>
  </tbody></table>
  <h3>4. Eligible ITC</h3>
  <table><thead><tr><th>Details</th><th class="num">IGST</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">Cess</th></tr></thead><tbody>
    <tr><td>(A)(5) All other ITC</td><td class="num">${f2(r.itc.igst)}</td><td class="num">${f2(r.itc.cgst)}</td><td class="num">${f2(r.itc.sgst)}</td><td class="num">${f2(r.itc.cess)}</td></tr>
    <tr><td><strong>(C) Net ITC available</strong></td><td class="num"><strong>${f2(r.itc.igst)}</strong></td><td class="num"><strong>${f2(r.itc.cgst)}</strong></td><td class="num"><strong>${f2(r.itc.sgst)}</strong></td><td class="num"><strong>${f2(r.itc.cess)}</strong></td></tr>
  </tbody></table>
  <h3>6.1 Payment of Tax</h3>
  <table><thead><tr><th>Tax</th><th class="num">Tax Payable</th><th class="num">Paid through ITC</th><th class="num">Paid in Cash</th></tr></thead><tbody>
    <tr><td>IGST</td><td class="num">${f2(r.outward.igst)}</td><td class="num">${f2(Math.min(r.outward.igst, r.itc.igst))}</td><td class="num">${f2(r.net_payable.igst)}</td></tr>
    <tr><td>CGST</td><td class="num">${f2(r.outward.cgst)}</td><td class="num">${f2(Math.min(r.outward.cgst, r.itc.cgst))}</td><td class="num">${f2(r.net_payable.cgst)}</td></tr>
    <tr><td>SGST</td><td class="num">${f2(r.outward.sgst)}</td><td class="num">${f2(Math.min(r.outward.sgst, r.itc.sgst))}</td><td class="num">${f2(r.net_payable.sgst)}</td></tr>
  </tbody></table>`;
  openPdfWindow(`GSTR-3B ${r.period.label}`, header("GSTR-3B Summary", r) + html);
}

export function exportPurchaseRegisterPDF(r: PurchaseRegisterReport) {
  const table = `<table><thead><tr><th>Supplier GSTIN</th><th>Supplier</th><th>Invoice #</th><th>Date</th><th class="num">Value</th><th>POS</th><th class="num">Rate</th><th class="num">Taxable</th><th class="num">IGST</th><th class="num">CGST</th><th class="num">SGST</th></tr></thead><tbody>${
    r.invoices.flatMap(inv => inv.items.map(it => `<tr><td>${esc(inv.party_gstin)}</td><td>${esc(inv.party_name)}</td><td>${esc(inv.doc_no)}</td><td>${esc(inv.doc_date)}</td><td class="num">${f2(inv.doc_value)}</td><td>${esc(inv.pos)}</td><td class="num">${it.rate}%</td><td class="num">${f2(it.taxable)}</td><td class="num">${f2(it.igst)}</td><td class="num">${f2(it.cgst)}</td><td class="num">${f2(it.sgst)}</td></tr>`)).join("")
  }</tbody></table>`;
  const rateTable = `<table><thead><tr><th class="num">Rate</th><th class="num">Taxable</th><th class="num">IGST</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">Invoices</th></tr></thead><tbody>${
    r.byRate.map(b => `<tr><td class="num">${b.rate}%</td><td class="num">${f2(b.taxable)}</td><td class="num">${f2(b.igst)}</td><td class="num">${f2(b.cgst)}</td><td class="num">${f2(b.sgst)}</td><td class="num">${b.count}</td></tr>`).join("")
  }<tr style="background:#eee"><td><strong>TOTAL</strong></td><td class="num"><strong>${f2(r.totals.taxable)}</strong></td><td class="num"><strong>${f2(r.totals.igst)}</strong></td><td class="num"><strong>${f2(r.totals.cgst)}</strong></td><td class="num"><strong>${f2(r.totals.sgst)}</strong></td><td class="num"><strong>${r.totals.invoice_count}</strong></td></tr></tbody></table>`;
  openPdfWindow(`Purchase Register ${r.period.label}`, header("Purchase Register / GSTR-2", r) + `<h3>Rate-wise ITC</h3>${rateTable}<h3>Invoices</h3>${table}`);
}

export function exportHSNPDF(r: HSNSummaryReport) {
  const tbl = (rows: HSNRow[]) => `<table><thead><tr><th>HSN</th><th>Description</th><th>UQC</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Taxable</th><th class="num">IGST</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">Total</th></tr></thead><tbody>${
    rows.map(h => `<tr><td>${esc(h.hsn)}</td><td>${esc(h.description)}</td><td>${esc(h.uqc)}</td><td class="num">${h.qty}</td><td class="num">${h.rate}%</td><td class="num">${f2(h.taxable)}</td><td class="num">${f2(h.igst)}</td><td class="num">${f2(h.cgst)}</td><td class="num">${f2(h.sgst)}</td><td class="num">${f2(h.total)}</td></tr>`).join("") || `<tr><td colspan="10" style="text-align:center;color:#888">No rows</td></tr>`
  }</tbody></table>`;
  openPdfWindow(`HSN Summary ${r.period.label}`, header("HSN-wise Summary", r) + `<h3>Outward (Sales)</h3>${tbl(r.outward)}<h3>Inward (Purchases)</h3>${tbl(r.inward)}`);
}

// ─── helpers ───
function ddmmyyyy(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}
