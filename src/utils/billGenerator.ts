import { format } from "date-fns";

interface BillItem {
  product_name: string;
  batch_number: string;
  hsn_code?: string;
  quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  total_price: number;
  expiry_date?: string;
}

interface BillData {
  type: "sale" | "purchase";
  invoice_number: string;
  date: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_gstin?: string;
  supplier_name?: string;
  items: BillItem[];
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
}

// Generate HTML bill content
function generateBillHTML(data: BillData): string {
  const isNoGst = data.items.every(item => item.gst_percentage === 0) && data.gst_amount === 0;
  
  const itemsHTML = data.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${item.product_name}</td>
        <td>${item.batch_number}</td>
        <td>${item.hsn_code || "-"}</td>
        <td>${item.quantity}</td>
        <td>₹${item.unit_price.toFixed(2)}</td>
        ${isNoGst ? "" : `<td>${item.gst_percentage}%</td>`}
        <td>${item.discount_percentage}%</td>
        <td>₹${item.total_price.toFixed(2)}</td>
      </tr>
    `
    )
    .join("");

  const totalCharges =
    data.freight_charges +
    data.handling_charges +
    (data.delivery_charges || 0) +
    data.other_charges;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.type === "sale" ? "Sales Invoice" : "Purchase Order"} - ${data.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #fff; color: #333; }
    .invoice { max-width: 800px; margin: 0 auto; border: 1px solid #ddd; padding: 30px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0d9488; padding-bottom: 20px; margin-bottom: 20px; }
    .company-name { font-size: 24px; font-weight: bold; color: #0d9488; }
    .invoice-title { font-size: 20px; color: #666; text-align: right; }
    .invoice-number { font-size: 14px; color: #888; margin-top: 5px; }
    .details { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .details-box { flex: 1; }
    .details-box h3 { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 8px; }
    .details-box p { font-size: 14px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #f7f7f7; padding: 12px 8px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666; border-bottom: 2px solid #ddd; }
    td { padding: 10px 8px; border-bottom: 1px solid #eee; font-size: 13px; }
    .totals { display: flex; justify-content: flex-end; }
    .totals-table { width: 300px; }
    .totals-table tr td { border: none; padding: 6px 8px; }
    .totals-table tr td:first-child { text-align: right; color: #666; }
    .totals-table tr td:last-child { text-align: right; font-weight: 500; }
    .totals-table tr.grand-total { font-size: 16px; font-weight: bold; border-top: 2px solid #0d9488; }
    .totals-table tr.grand-total td { padding-top: 12px; color: #0d9488; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #888; }
    .notes { margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px; }
    .notes h4 { font-size: 12px; color: #666; margin-bottom: 8px; }
    @media print { body { padding: 0; } .invoice { border: none; } }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div>
        <div class="company-name">Pharmacy ERP</div>
        <div style="color: #888; font-size: 12px; margin-top: 5px;">Your trusted healthcare partner</div>
      </div>
      <div class="invoice-title">
        ${isNoGst ? "BILL OF SUPPLY" : (data.type === "sale" ? "TAX INVOICE" : "PURCHASE ORDER")}
        <div class="invoice-number">${data.invoice_number}</div>
        <div class="invoice-number">Date: ${format(new Date(data.date), "dd MMM yyyy")}</div>
      </div>
    </div>
    
    <div class="details">
      <div class="details-box">
        <h3>${data.type === "sale" ? "Bill To" : "Supplier"}</h3>
        <p><strong>${data.type === "sale" ? data.customer_name : data.supplier_name}</strong></p>
        ${data.customer_phone ? `<p>Phone: ${data.customer_phone}</p>` : ""}
        ${data.customer_address ? `<p>${data.customer_address}</p>` : ""}
        ${data.customer_gstin ? `<p>GSTIN: ${data.customer_gstin}</p>` : ""}
      </div>
      <div class="details-box" style="text-align: right;">
        <h3>Payment Info</h3>
        <p>Method: ${data.payment_method || "Cash"}</p>
        <p>Status: Confirmed</p>
      </div>
    </div>
    
    <table>
      <thead>
         <tr>
          <th>#</th>
          <th>Product</th>
          <th>Batch</th>
          <th>HSN</th>
          <th>Qty</th>
          <th>Price</th>
          ${isNoGst ? "" : "<th>GST</th>"}
          <th>Disc</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>
    
    <div class="totals">
      <table class="totals-table">
        <tr>
          <td>Subtotal:</td>
          <td>₹${data.subtotal.toFixed(2)}</td>
        </tr>
        <tr>
          <td>GST:</td>
          <td>₹${data.gst_amount.toFixed(2)}</td>
        </tr>
        ${data.discount_amount > 0 ? `<tr><td>Discount:</td><td>-₹${data.discount_amount.toFixed(2)}</td></tr>` : ""}
        ${totalCharges > 0 ? `<tr><td>Other Charges:</td><td>₹${totalCharges.toFixed(2)}</td></tr>` : ""}
        <tr class="grand-total">
          <td>Grand Total:</td>
          <td>₹${data.total_amount.toFixed(2)}</td>
        </tr>
      </table>
    </div>
    
    ${data.notes ? `<div class="notes"><h4>Notes</h4><p>${data.notes}</p></div>` : ""}
    
    <div class="footer">
      Thank you for your business! • Generated on ${format(new Date(), "dd MMM yyyy HH:mm")}
    </div>
  </div>
</body>
</html>
  `;
}

// Generate CSV for Excel
function generateBillCSV(data: BillData): string {
  const headers = [
    "Sr No",
    "Product",
    "Batch",
    "HSN Code",
    "Quantity",
    "Unit Price",
    "GST %",
    "Discount %",
    "Total",
  ];

  const rows = data.items.map((item, index) => [
    index + 1,
    `"${item.product_name}"`,
    item.batch_number,
    item.hsn_code || "",
    item.quantity,
    item.unit_price.toFixed(2),
    item.gst_percentage,
    item.discount_percentage,
    item.total_price.toFixed(2),
  ]);

  const totalCharges =
    data.freight_charges +
    data.handling_charges +
    (data.delivery_charges || 0) +
    data.other_charges;

  const summaryRows = [
    [],
    [`${data.type === "sale" ? "Invoice" : "Order"} Number:`, data.invoice_number],
    ["Date:", format(new Date(data.date), "dd MMM yyyy")],
    [data.type === "sale" ? "Customer:" : "Supplier:", data.customer_name || data.supplier_name],
    ...(data.customer_gstin ? [["Customer GSTIN:", data.customer_gstin]] : []),
    [],
    ["Subtotal:", "", "", "", "", "", "", "", data.subtotal.toFixed(2)],
    ["GST Amount:", "", "", "", "", "", "", "", data.gst_amount.toFixed(2)],
    ["Discount:", "", "", "", "", "", "", "", `-${data.discount_amount.toFixed(2)}`],
    ["Other Charges:", "", "", "", "", "", "", "", totalCharges.toFixed(2)],
    ["Grand Total:", "", "", "", "", "", "", "", data.total_amount.toFixed(2)],
  ];

  return [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
    ...summaryRows.map((row) => row.join(",")),
  ].join("\n");
}

// Export functions
export function printBill(data: BillData): void {
  const html = generateBillHTML(data);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

export function downloadBillHTML(data: BillData): void {
  const html = generateBillHTML(data);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.type === "sale" ? "invoice" : "purchase"}_${data.invoice_number}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadBillCSV(data: BillData): void {
  const csv = generateBillCSV(data);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.type === "sale" ? "invoice" : "purchase"}_${data.invoice_number}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadBillPDF(data: BillData): void {
  // For PDF, we'll open HTML in new window and use browser print to PDF
  const html = generateBillHTML(data);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    // User can use browser's "Save as PDF" from print dialog
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

export type { BillData, BillItem };
