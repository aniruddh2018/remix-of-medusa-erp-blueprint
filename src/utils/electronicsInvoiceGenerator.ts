import { format } from "date-fns";

interface InvoiceItem {
  product_name: string;
  hsn_code?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  total_price: number;
}

interface InvoiceSettings {
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_gstin: string;
  company_state: string;
  logo_url?: string;
  terms_and_conditions: string;
  show_ship_to: boolean;
  show_due_date: boolean;
  show_previous_balance: boolean;
  show_tax_summary: boolean;
  show_amount_in_words: boolean;
}

interface ElectronicsInvoiceData {
  type: "sale" | "purchase";
  invoice_number: string;
  date: string;
  due_date?: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  customer_gstin?: string;
  ship_to_address?: string;
  items: InvoiceItem[];
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
  received_amount?: number;
  previous_balance?: number;
  settings: InvoiceSettings;
}

function numberToWords(num: number): string {
  if (num === 0) return "Zero Rupees only";
  
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  
  const convertGroup = (n: number): string => {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convertGroup(n % 100) : "");
  };

  const rounded = Math.round(num);
  let result = "";
  
  if (rounded >= 10000000) {
    result += convertGroup(Math.floor(rounded / 10000000)) + " Crore ";
    num = rounded % 10000000;
  } else {
    num = rounded;
  }
  if (num >= 100000) {
    result += convertGroup(Math.floor(num / 100000)) + " Lakh ";
    num = num % 100000;
  }
  if (num >= 1000) {
    result += convertGroup(Math.floor(num / 1000)) + " Thousand ";
    num = num % 1000;
  }
  if (num > 0) {
    result += convertGroup(Math.floor(num));
  }

  return result.trim() + " Rupees only";
}

function buildHSNSummary(items: InvoiceItem[]): { hsn: string; taxable: number; cgstRate: number; cgstAmt: number; sgstRate: number; sgstAmt: number; totalTax: number }[] {
  const map = new Map<string, { taxable: number; gstRate: number }>();
  
  items.forEach(item => {
    const hsn = item.hsn_code || "N/A";
    const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
    const existing = map.get(hsn) || { taxable: 0, gstRate: item.gst_percentage };
    existing.taxable += basePrice;
    map.set(hsn, existing);
  });

  return Array.from(map.entries()).map(([hsn, data]) => {
    const halfRate = data.gstRate / 2;
    const cgstAmt = data.taxable * halfRate / 100;
    const sgstAmt = data.taxable * halfRate / 100;
    return {
      hsn,
      taxable: data.taxable,
      cgstRate: halfRate,
      cgstAmt,
      sgstRate: halfRate,
      sgstAmt,
      totalTax: cgstAmt + sgstAmt,
    };
  });
}

function generateElectronicsInvoiceHTML(data: ElectronicsInvoiceData): string {
  const s = data.settings;
  const totalCharges = data.freight_charges + data.handling_charges + (data.delivery_charges || 0) + data.other_charges;
  const grandTotal = Math.round(data.total_amount);
  const received = data.received_amount || 0;
  const balance = grandTotal - received;
  const previousBalance = data.previous_balance || 0;
  const currentBalance = balance + previousBalance;
  const hsnSummary = buildHSNSummary(data.items);
  const totalTax = hsnSummary.reduce((s, r) => s + r.totalTax, 0);

  const itemsHTML = data.items.map((item, i) => {
    const gstAmt = item.unit_price * item.quantity * (1 - item.discount_percentage / 100) * item.gst_percentage / 100;
    return `<tr>
      <td>${i + 1}</td>
      <td class="item-name">${item.product_name}</td>
      <td>${item.hsn_code || "-"}</td>
      <td>${item.quantity}</td>
      <td>${item.unit || "Pcs"}</td>
      <td>₹ ${item.unit_price.toFixed(2)}</td>
      <td>₹ ${gstAmt.toFixed(2)} (${item.gst_percentage}%)</td>
      <td>₹ ${item.total_price.toFixed(2)}</td>
    </tr>`;
  }).join("");

  const hsnRows = hsnSummary.map(r => `<tr>
    <td>${r.hsn}</td>
    <td>₹ ${r.taxable.toFixed(2)}</td>
    <td>${r.cgstRate}%</td>
    <td>₹ ${r.cgstAmt.toFixed(2)}</td>
    <td>${r.sgstRate}%</td>
    <td>₹ ${r.sgstAmt.toFixed(2)}</td>
    <td>₹ ${r.totalTax.toFixed(2)}</td>
  </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice - ${data.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 15px; background: #fff; color: #333; font-size: 13px; }
    .invoice { max-width: 850px; margin: 0 auto; border: 2px solid #333; }
    
    /* Header */
    .inv-header { text-align: center; padding: 15px 20px; border-bottom: 2px solid #333; }
    .inv-title { font-size: 22px; font-weight: bold; color: #1a56db; margin-bottom: 4px; }
    .company-name { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
    .company-details { font-size: 11px; color: #555; line-height: 1.6; }
    .gstin-line { font-weight: 600; font-size: 12px; margin-top: 4px; }
    
    /* Bill To / Invoice Details / Ship To */
    .info-row { display: flex; border-bottom: 1px solid #333; }
    .info-box { flex: 1; padding: 10px 15px; }
    .info-box:not(:last-child) { border-right: 1px solid #333; }
    .info-box h3 { font-size: 12px; font-weight: bold; color: #1a56db; margin-bottom: 6px; text-transform: uppercase; }
    .info-box p { font-size: 12px; margin-bottom: 2px; }
    
    /* Items Table */
    .items-table { width: 100%; border-collapse: collapse; }
    .items-table th { background: #e8edf5; padding: 8px 6px; text-align: left; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #333; border-top: 1px solid #333; font-weight: 700; }
    .items-table td { padding: 6px; border-bottom: 1px solid #ddd; font-size: 12px; }
    .items-table .item-name { max-width: 220px; }
    .items-table tr:last-child td { border-bottom: 2px solid #333; }
    .items-table .total-row td { font-weight: bold; background: #f5f5f5; border-top: 2px solid #333; }
    
    /* Tax Summary */
    .tax-section { padding: 12px 15px; border-top: 1px solid #333; }
    .tax-section h3 { font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #1a56db; }
    .tax-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    .tax-table th { background: #e8edf5; padding: 6px; font-size: 10px; text-transform: uppercase; border: 1px solid #ccc; }
    .tax-table td { padding: 5px 6px; font-size: 11px; border: 1px solid #ccc; text-align: right; }
    .tax-table td:first-child { text-align: left; }
    
    /* Summary */
    .summary-section { display: flex; justify-content: space-between; border-top: 1px solid #333; padding: 12px 15px; }
    .amount-words { flex: 1; font-size: 12px; font-style: italic; padding-right: 20px; }
    .amount-words strong { font-style: normal; }
    .balance-box { text-align: right; font-size: 12px; }
    .balance-box p { margin-bottom: 3px; }
    .balance-box .total-line { font-size: 15px; font-weight: bold; color: #1a56db; }
    
    /* Footer */
    .footer { border-top: 1px solid #333; padding: 12px 15px; }
    .footer h4 { font-size: 11px; font-weight: bold; margin-bottom: 4px; }
    .footer p { font-size: 11px; color: #555; }
    .signature-area { display: flex; justify-content: space-between; margin-top: 30px; padding: 0 15px 15px; }
    .signature-area div { text-align: center; font-size: 11px; border-top: 1px solid #999; padding-top: 5px; width: 200px; }
    
    @media print { 
      body { padding: 0; } 
      .invoice { border: 1px solid #333; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <!-- Header -->
    <div class="inv-header">
      <div class="inv-title">Invoice</div>
      <div class="company-name">${s.company_name || "Your Company"}</div>
      <div class="company-details">
        ${s.company_address ? `${s.company_address}<br>` : ""}
        ${s.company_phone ? `Phone: ${s.company_phone}` : ""} ${s.company_email ? `&nbsp;|&nbsp; Email: ${s.company_email}` : ""}
        ${s.company_gstin ? `<div class="gstin-line">GSTIN: ${s.company_gstin}</div>` : ""}
        ${s.company_state ? `<div>State: ${s.company_state}</div>` : ""}
      </div>
    </div>

    <!-- Bill To / Invoice Details / Ship To -->
    <div class="info-row">
      <div class="info-box">
        <h3>Bill To:</h3>
        <p><strong>${data.customer_name}</strong></p>
        ${data.customer_address ? `<p>${data.customer_address}</p>` : ""}
        ${data.customer_phone ? `<p>Contact No: ${data.customer_phone}</p>` : ""}
        ${data.customer_gstin ? `<p>GSTIN: ${data.customer_gstin}</p>` : ""}
      </div>
      <div class="info-box">
        <h3>Invoice Details:</h3>
        <p>No: <strong>${data.invoice_number}</strong></p>
        <p>Date: ${format(new Date(data.date), "dd/MM/yyyy")}</p>
        ${s.show_due_date && data.due_date ? `<p>Due Date: ${format(new Date(data.due_date), "dd/MM/yyyy")}</p>` : ""}
      </div>
      ${s.show_ship_to ? `<div class="info-box">
        <h3>Ship To:</h3>
        <p>${data.ship_to_address || data.customer_address || ""}</p>
      </div>` : ""}
    </div>

    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Item name</th>
          <th>HSN/SAC</th>
          <th>Quantity</th>
          <th>Unit</th>
          <th>Final Rate(₹)</th>
          <th>GST(₹)</th>
          <th>Amount(₹)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
        <tr class="total-row">
          <td colspan="6">Total</td>
          <td>₹ ${totalTax.toFixed(2)}</td>
          <td>₹ ${data.subtotal.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Tax Summary -->
    ${s.show_tax_summary ? `<div class="tax-section">
      <h3>Tax Summary:</h3>
      <p style="font-size:12px; margin-bottom:8px;">Sub Total: ₹ ${data.subtotal.toFixed(2)}</p>
      <table class="tax-table">
        <thead>
          <tr>
            <th>HSN/SAC</th>
            <th>Taxable amount (₹)</th>
            <th>CGST Rate (%)</th>
            <th>CGST Amt (₹)</th>
            <th>SGST Rate (%)</th>
            <th>SGST Amt (₹)</th>
            <th>Total Tax (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${hsnRows}
          <tr style="font-weight:bold;">
            <td>TOTAL</td>
            <td></td><td></td><td></td><td></td><td></td>
            <td>₹ ${totalTax.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>` : ""}

    <!-- Summary -->
    <div class="summary-section">
      ${s.show_amount_in_words ? `<div class="amount-words">
        <strong>Invoice Amount in Words:</strong><br>
        ${numberToWords(grandTotal)}
      </div>` : "<div></div>"}
      <div class="balance-box">
        <p>Received: ₹ ${received.toFixed(2)}</p>
        <p>Balance: ₹ ${balance.toFixed(2)}</p>
        ${s.show_previous_balance ? `<p>Previous Balance: ₹ ${previousBalance.toFixed(2)}</p>
        <p class="total-line">Current Balance: ₹ ${currentBalance.toFixed(2)}</p>` : `<p class="total-line">Total: ₹ ${grandTotal.toFixed(2)}</p>`}
      </div>
    </div>

    <!-- Terms & Footer -->
    ${s.terms_and_conditions ? `<div class="footer">
      <h4>Terms & Conditions:</h4>
      <p>${s.terms_and_conditions}</p>
    </div>` : ""}

    <div class="signature-area">
      <div>Customer Signature</div>
      <div>For ${s.company_name || "Company"}<br>Authorised Signatory</div>
    </div>
  </div>
</body>
</html>`;
}

export function printElectronicsInvoice(data: ElectronicsInvoiceData): void {
  const html = generateElectronicsInvoiceHTML(data);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  }
}

export function downloadElectronicsInvoiceHTML(data: ElectronicsInvoiceData): void {
  const html = generateElectronicsInvoiceHTML(data);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoice_${data.invoice_number}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadElectronicsInvoicePDF(data: ElectronicsInvoiceData): void {
  const html = generateElectronicsInvoiceHTML(data);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  }
}

export type { ElectronicsInvoiceData, InvoiceItem, InvoiceSettings };
