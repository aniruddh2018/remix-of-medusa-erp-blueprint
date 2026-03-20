import { format } from "date-fns";
import type { FullInvoiceSettings } from "@/hooks/useInvoiceSettings";

interface TemplateItem {
  product_name: string;
  batch_number?: string;
  hsn_code?: string;
  quantity: number;
  free_quantity?: number;
  unit?: string;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  total_price: number;
  expiry_date?: string;
}

interface InvoiceTemplateData {
  type: "sale" | "purchase";
  invoice_number: string;
  date: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_gstin?: string;
  supplier_name?: string;
  items: TemplateItem[];
  subtotal: number;
  gst_amount: number;
  discount_amount: number;
  freight_charges: number;
  handling_charges: number;
  delivery_charges?: number;
  other_charges: number;
  total_amount: number;
  payment_method?: string;
  notes?: string;
  salesperson?: string;
  gstInclusive?: boolean;
}

function numberToWords(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];

  if (num === 0) return "Zero";
  const n = Math.floor(Math.abs(num));
  if (n < 10) return ones[n];
  if (n < 20) return teens[n - 10];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + numberToWords(n % 100) : "");
  if (n < 100000) return numberToWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + numberToWords(n % 1000) : "");
  if (n < 10000000) return numberToWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + numberToWords(n % 100000) : "");
  return numberToWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + numberToWords(n % 10000000) : "");
}

function getFontSize(size: string): { body: string; header: string; small: string } {
  switch (size) {
    case "small": return { body: "11px", header: "16px", small: "9px" };
    case "large": return { body: "15px", header: "22px", small: "12px" };
    default: return { body: "13px", header: "20px", small: "10px" };
  }
}

export function generateConfigurableInvoice(
  data: InvoiceTemplateData,
  settings: FullInvoiceSettings
): string {
  const isNoGst = data.items.every(i => i.gst_percentage === 0) && data.gst_amount === 0;
  const isGstInclusive = data.gstInclusive && !isNoGst;
  const isThermal = settings.invoice_layout === "thermal";
  const font = getFontSize(settings.print_font_size);
  const align = settings.print_alignment || "left";
  const totalCharges = data.freight_charges + data.handling_charges + (data.delivery_charges || 0) + data.other_charges;
  const roundOff = settings.show_roundoff ? Math.round(data.total_amount) - data.total_amount : 0;
  const finalTotal = settings.show_roundoff ? Math.round(data.total_amount) : data.total_amount;

  // Build table columns dynamically
  const cols: { key: string; label: string; align: string }[] = [
    { key: "sr", label: "#", align: "center" },
    { key: "product", label: "Product", align: "left" },
  ];
  if (settings.show_hsn_column) cols.push({ key: "hsn", label: "HSN", align: "left" });
  if (settings.show_batch_column) cols.push({ key: "batch", label: "Batch", align: "left" });
  if (settings.show_expiry_column) cols.push({ key: "expiry", label: "Expiry", align: "center" });
  cols.push({ key: "qty", label: "Qty", align: "center" });
  if (settings.show_free_qty_column) cols.push({ key: "free", label: "Free", align: "center" });
  if (settings.show_rate_column) cols.push({ key: "rate", label: "Rate", align: "right" });
  if (data.items.some(i => i.discount_percentage > 0)) cols.push({ key: "disc", label: "Disc%", align: "center" });
  if (!isNoGst) cols.push({ key: "gst", label: "GST%", align: "center" });
  if (!isNoGst && settings.show_tax_amount_column) cols.push({ key: "taxamt", label: "Tax Amt", align: "right" });
  cols.push({ key: "total", label: "Amount", align: "right" });

  const headerRow = cols.map(c => `<th style="text-align:${c.align};padding:${isThermal ? '4px 2px' : '8px 6px'};font-size:${font.small};text-transform:uppercase;color:#555;border-bottom:2px solid #ddd;">${c.label}</th>`).join("");

  const itemRows = data.items.map((item, i) => {
    const taxAmt = item.unit_price * item.quantity * (item.gst_percentage / 100) * (1 - item.discount_percentage / 100);
    const cells: string[] = [];
    for (const col of cols) {
      let val = "";
      switch (col.key) {
        case "sr": val = `${i + 1}`; break;
        case "product": val = item.product_name; break;
        case "hsn": val = item.hsn_code || "-"; break;
        case "batch": val = item.batch_number || "-"; break;
        case "expiry": val = item.expiry_date ? format(new Date(item.expiry_date), "MM/yy") : "-"; break;
        case "qty": val = `${item.quantity}`; break;
        case "free": val = `${item.free_quantity || 0}`; break;
        case "rate": val = `₹${item.unit_price.toFixed(2)}`; break;
        case "disc": val = `${item.discount_percentage}%`; break;
        case "gst": val = `${item.gst_percentage}%`; break;
        case "taxamt": val = `₹${taxAmt.toFixed(2)}`; break;
        case "total": val = `₹${item.total_price.toFixed(2)}`; break;
      }
      cells.push(`<td style="text-align:${col.align};padding:${isThermal ? '3px 2px' : '6px'};font-size:${font.body};border-bottom:1px solid #eee;">${val}</td>`);
    }
    return `<tr>${cells.join("")}</tr>`;
  }).join("");

  // GST split (CGST/SGST)
  const gstSplit = settings.show_gst_split && !isNoGst;
  const cgst = data.gst_amount / 2;
  const sgst = data.gst_amount / 2;

  // HSN-wise tax summary
  let taxSummaryHtml = "";
  if (settings.show_tax_summary && !isNoGst) {
    const hsnMap = new Map<string, { taxableValue: number; gstRate: number; cgst: number; sgst: number; total: number }>();
    data.items.forEach(item => {
      const hsn = item.hsn_code || "N/A";
      const base = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
      const tax = base * item.gst_percentage / 100;
      const existing = hsnMap.get(hsn);
      if (existing) {
        existing.taxableValue += base;
        existing.cgst += tax / 2;
        existing.sgst += tax / 2;
        existing.total += tax;
      } else {
        hsnMap.set(hsn, { taxableValue: base, gstRate: item.gst_percentage, cgst: tax / 2, sgst: tax / 2, total: tax });
      }
    });
    const rows = Array.from(hsnMap.entries()).map(([hsn, v]) =>
      `<tr><td style="padding:4px 6px;font-size:${font.small};">${hsn}</td><td style="padding:4px 6px;font-size:${font.small};text-align:right;">₹${v.taxableValue.toFixed(2)}</td><td style="padding:4px 6px;font-size:${font.small};text-align:center;">${v.gstRate}%</td><td style="padding:4px 6px;font-size:${font.small};text-align:right;">₹${v.cgst.toFixed(2)}</td><td style="padding:4px 6px;font-size:${font.small};text-align:right;">₹${v.sgst.toFixed(2)}</td><td style="padding:4px 6px;font-size:${font.small};text-align:right;">₹${v.total.toFixed(2)}</td></tr>`
    ).join("");
    taxSummaryHtml = `
      <div style="margin-top:12px;page-break-inside:avoid;">
        <h4 style="font-size:${font.small};color:#888;text-transform:uppercase;margin-bottom:4px;">Tax Summary</h4>
        <table style="width:100%;border-collapse:collapse;border:1px solid #ddd;">
          <thead><tr style="background:#f5f5f5;">
            <th style="padding:4px 6px;font-size:${font.small};text-align:left;">HSN</th>
            <th style="padding:4px 6px;font-size:${font.small};text-align:right;">Taxable</th>
            <th style="padding:4px 6px;font-size:${font.small};text-align:center;">Rate</th>
            <th style="padding:4px 6px;font-size:${font.small};text-align:right;">CGST</th>
            <th style="padding:4px 6px;font-size:${font.small};text-align:right;">SGST</th>
            <th style="padding:4px 6px;font-size:${font.small};text-align:right;">Total Tax</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  const maxWidth = isThermal ? "80mm" : "800px";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.type === "sale" ? "Invoice" : "Purchase Order"} - ${data.invoice_number}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; padding:${isThermal ? '4px' : '20px'}; background:#fff; color:#333; font-size:${font.body}; }
    .invoice { max-width:${maxWidth}; margin:0 auto; ${isThermal ? '' : 'border:1px solid #ddd; padding:24px;'} }
    @media print { body { padding:0; } .invoice { border:none; max-width:100%; } }
  </style>
</head>
<body>
<div class="invoice">
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0d9488;padding-bottom:${isThermal ? '8px' : '16px'};margin-bottom:${isThermal ? '8px' : '16px'};">
    <div style="text-align:${settings.logo_alignment};">
      ${settings.company_name ? `<div style="font-size:${font.header};font-weight:bold;color:#0d9488;">${settings.company_name}</div>` : ''}
      ${settings.company_address ? `<div style="font-size:${font.small};color:#666;margin-top:2px;">${settings.company_address}</div>` : ''}
      ${settings.company_phone ? `<div style="font-size:${font.small};color:#666;">Ph: ${settings.company_phone}</div>` : ''}
      ${settings.company_gstin ? `<div style="font-size:${font.small};color:#666;">GSTIN: ${settings.company_gstin}</div>` : ''}
    </div>
    <div style="text-align:right;">
      <div style="font-size:${font.header};color:#666;">${isNoGst ? "BILL OF SUPPLY" : (data.type === "sale" ? "TAX INVOICE" : "PURCHASE ORDER")}${isGstInclusive ? ' <span style="font-size:' + font.small + ';color:#888;">(GST Inclusive)</span>' : ''}</div>
      <div style="font-size:${font.small};color:#888;margin-top:4px;">${data.invoice_number}</div>
      <div style="font-size:${font.small};color:#888;">Date: ${format(new Date(data.date), "dd MMM yyyy")}</div>
      ${data.payment_method ? `<div style="font-size:${font.small};color:#888;">Payment: ${data.payment_method}</div>` : ''}
      ${settings.show_salesperson && data.salesperson ? `<div style="font-size:${font.small};color:#888;">Salesperson: ${data.salesperson}</div>` : ''}
    </div>
  </div>

  <!-- Customer/Supplier -->
  <div style="display:flex;justify-content:space-between;margin-bottom:${isThermal ? '8px' : '16px'};">
    <div>
      <div style="font-size:${font.small};color:#888;text-transform:uppercase;margin-bottom:4px;">${data.type === "sale" ? "Bill To" : "Supplier"}</div>
      <div style="font-weight:bold;">${data.type === "sale" ? data.customer_name : data.supplier_name}</div>
      ${data.customer_phone ? `<div style="font-size:${font.small};">Ph: ${data.customer_phone}</div>` : ''}
      ${data.customer_address ? `<div style="font-size:${font.small};">${data.customer_address}</div>` : ''}
      ${settings.show_customer_gstin && data.customer_gstin ? `<div style="font-size:${font.small};">GSTIN: ${data.customer_gstin}</div>` : ''}
    </div>
  </div>

  <!-- Items Table -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:${isThermal ? '8px' : '16px'};">
    <thead><tr>${headerRow}</tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- Totals -->
  <div style="display:flex;justify-content:flex-end;">
    <table style="width:${isThermal ? '100%' : '300px'};">
      <tr><td style="text-align:right;color:#666;padding:4px 6px;font-size:${font.body};">Subtotal:</td><td style="text-align:right;padding:4px 6px;font-size:${font.body};">₹${data.subtotal.toFixed(2)}</td></tr>
      ${!isNoGst ? (gstSplit ? `
        <tr><td style="text-align:right;color:#666;padding:3px 6px;font-size:${font.small};">CGST:</td><td style="text-align:right;padding:3px 6px;font-size:${font.small};">₹${cgst.toFixed(2)}</td></tr>
        <tr><td style="text-align:right;color:#666;padding:3px 6px;font-size:${font.small};">SGST:</td><td style="text-align:right;padding:3px 6px;font-size:${font.small};">₹${sgst.toFixed(2)}</td></tr>
      ` : `<tr><td style="text-align:right;color:#666;padding:4px 6px;font-size:${font.body};">GST:</td><td style="text-align:right;padding:4px 6px;font-size:${font.body};">₹${data.gst_amount.toFixed(2)}</td></tr>`) : ''}
      ${data.discount_amount > 0 ? `<tr><td style="text-align:right;color:#666;padding:4px 6px;font-size:${font.body};">Discount:</td><td style="text-align:right;padding:4px 6px;font-size:${font.body};">-₹${data.discount_amount.toFixed(2)}</td></tr>` : ''}
      ${totalCharges > 0 ? `<tr><td style="text-align:right;color:#666;padding:4px 6px;font-size:${font.body};">Other Charges:</td><td style="text-align:right;padding:4px 6px;font-size:${font.body};">₹${totalCharges.toFixed(2)}</td></tr>` : ''}
      ${settings.show_roundoff && Math.abs(roundOff) > 0.001 ? `<tr><td style="text-align:right;color:#666;padding:3px 6px;font-size:${font.small};">Round Off:</td><td style="text-align:right;padding:3px 6px;font-size:${font.small};">${roundOff >= 0 ? '+' : ''}₹${roundOff.toFixed(2)}</td></tr>` : ''}
      <tr style="font-weight:bold;font-size:${isThermal ? font.body : '16px'};border-top:2px solid #0d9488;">
        <td style="text-align:right;padding:8px 6px;color:#0d9488;">Grand Total:</td>
        <td style="text-align:right;padding:8px 6px;color:#0d9488;">₹${finalTotal.toFixed(2)}</td>
      </tr>
    </table>
  </div>

  ${settings.show_amount_in_words ? `<div style="font-size:${font.small};color:#666;margin-top:8px;font-style:italic;">Amount in words: ${numberToWords(Math.round(finalTotal))} Rupees Only</div>` : ''}

  ${taxSummaryHtml}

  <!-- Bank Details -->
  ${settings.bank_name ? `
  <div style="margin-top:12px;padding:8px;background:#f9f9f9;border-radius:4px;font-size:${font.small};">
    <strong>Bank Details:</strong> ${settings.bank_name}${settings.bank_account_number ? ` | A/C: ${settings.bank_account_number}` : ''}${settings.bank_ifsc ? ` | IFSC: ${settings.bank_ifsc}` : ''}${settings.bank_branch ? ` | ${settings.bank_branch}` : ''}
  </div>` : ''}

  ${data.notes ? `<div style="margin-top:12px;padding:10px;background:#f9f9f9;border-radius:4px;font-size:${font.small};"><strong>Notes:</strong> ${data.notes}</div>` : ''}

  ${settings.terms_and_conditions ? `<div style="margin-top:8px;font-size:${font.small};color:#888;">${settings.terms_and_conditions}</div>` : ''}

  <div style="margin-top:16px;padding-top:12px;border-top:1px solid #ddd;text-align:center;font-size:${font.small};color:#888;">
    Generated on ${format(new Date(), "dd MMM yyyy HH:mm")}
  </div>
</div>
</body>
</html>`;
}

export function printConfigurableInvoice(data: InvoiceTemplateData, settings: FullInvoiceSettings): void {
  const html = generateConfigurableInvoice(data, settings);
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  }
}

export function downloadConfigurableInvoiceHTML(data: InvoiceTemplateData, settings: FullInvoiceSettings): void {
  const html = generateConfigurableInvoice(data, settings);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.type === "sale" ? "invoice" : "purchase"}_${data.invoice_number}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadConfigurableInvoicePDF(data: InvoiceTemplateData, settings: FullInvoiceSettings): void {
  printConfigurableInvoice(data, settings);
}

export type { InvoiceTemplateData, TemplateItem };
