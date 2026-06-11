/**
 * Generate a PDF blob from a BillData object and upload it to the
 * `invoice-attachments` storage bucket. Returns a long-lived signed URL
 * that can be shared in a WhatsApp message.
 */
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/integrations/supabase/client";
import type { BillData } from "@/utils/billGenerator";

// Reuse the existing HTML invoice template by importing the renderer.
// `billGenerator.ts` keeps it private, so we duplicate the minimal markup here.
function renderBillHtml(data: BillData): string {
  const isNoGst =
    data.items.every((i) => i.gst_percentage === 0) && data.gst_amount === 0;
  const itemsHtml = data.items
    .map(
      (item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(item.product_name)}</td>
          <td>${escapeHtml(item.batch_number || "-")}</td>
          <td>${item.hsn_code || "-"}</td>
          <td>${item.quantity}</td>
          <td>₹${item.unit_price.toFixed(2)}</td>
          ${isNoGst ? "" : `<td>${item.gst_percentage}%</td>`}
          <td>${item.discount_percentage}%</td>
          <td>₹${item.total_price.toFixed(2)}</td>
        </tr>`,
    )
    .join("");
  const totalCharges =
    data.freight_charges +
    data.handling_charges +
    (data.delivery_charges || 0) +
    data.other_charges;
  return `
    <div style="font-family: Arial, sans-serif; padding: 24px; width: 760px; color: #222; background:#fff;">
      <div style="display:flex; justify-content:space-between; border-bottom:2px solid #0d9488; padding-bottom:12px; margin-bottom:16px;">
        <div>
          <div style="font-size:22px; font-weight:700; color:#0d9488;">Invoice</div>
          <div style="font-size:12px; color:#666;">${
            isNoGst ? "Bill of Supply" : data.type === "sale" ? "Tax Invoice" : "Purchase Order"
          }</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:600;">${escapeHtml(data.invoice_number)}</div>
          <div style="font-size:12px; color:#666;">${new Date(data.date).toLocaleDateString()}</div>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:14px; font-size:13px;">
        <div>
          <div style="color:#888; font-size:11px; text-transform:uppercase;">${
            data.type === "sale" ? "Bill To" : "Supplier"
          }</div>
          <div style="font-weight:600;">${escapeHtml(
            (data.type === "sale" ? data.customer_name : data.supplier_name) || "",
          )}</div>
          ${data.customer_phone ? `<div>${escapeHtml(data.customer_phone)}</div>` : ""}
          ${data.customer_address ? `<div>${escapeHtml(data.customer_address)}</div>` : ""}
          ${data.customer_gstin ? `<div>GSTIN: ${escapeHtml(data.customer_gstin)}</div>` : ""}
        </div>
        <div style="text-align:right;">
          <div style="color:#888; font-size:11px; text-transform:uppercase;">Payment</div>
          <div>${escapeHtml(data.payment_method || "Cash")}</div>
        </div>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="text-align:left; padding:6px; border-bottom:1px solid #ddd;">#</th>
            <th style="text-align:left; padding:6px; border-bottom:1px solid #ddd;">Product</th>
            <th style="text-align:left; padding:6px; border-bottom:1px solid #ddd;">Batch</th>
            <th style="text-align:left; padding:6px; border-bottom:1px solid #ddd;">HSN</th>
            <th style="text-align:left; padding:6px; border-bottom:1px solid #ddd;">Qty</th>
            <th style="text-align:left; padding:6px; border-bottom:1px solid #ddd;">Price</th>
            ${isNoGst ? "" : '<th style="text-align:left; padding:6px; border-bottom:1px solid #ddd;">GST</th>'}
            <th style="text-align:left; padding:6px; border-bottom:1px solid #ddd;">Disc</th>
            <th style="text-align:left; padding:6px; border-bottom:1px solid #ddd;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div style="display:flex; justify-content:flex-end; margin-top:14px;">
        <table style="width:280px; font-size:13px;">
          <tr><td style="color:#666; text-align:right; padding:3px;">Subtotal:</td><td style="text-align:right; padding:3px;">₹${data.subtotal.toFixed(2)}</td></tr>
          ${isNoGst ? "" : `<tr><td style="color:#666; text-align:right; padding:3px;">GST:</td><td style="text-align:right; padding:3px;">₹${data.gst_amount.toFixed(2)}</td></tr>`}
          ${data.discount_amount > 0 ? `<tr><td style="color:#666; text-align:right; padding:3px;">Discount:</td><td style="text-align:right; padding:3px;">-₹${data.discount_amount.toFixed(2)}</td></tr>` : ""}
          ${totalCharges > 0 ? `<tr><td style="color:#666; text-align:right; padding:3px;">Other Charges:</td><td style="text-align:right; padding:3px;">₹${totalCharges.toFixed(2)}</td></tr>` : ""}
          <tr style="border-top:2px solid #0d9488; font-weight:700; color:#0d9488;">
            <td style="text-align:right; padding:6px;">Grand Total:</td><td style="text-align:right; padding:6px;">₹${data.total_amount.toFixed(2)}</td>
          </tr>
        </table>
      </div>
      ${data.notes ? `<div style="margin-top:18px; padding:10px; background:#f9f9f9; font-size:12px;"><strong>Notes:</strong> ${escapeHtml(data.notes)}</div>` : ""}
    </div>
  `;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function generateBillPdfBlob(data: BillData): Promise<Blob> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = renderBillHtml(data);
  document.body.appendChild(container);
  try {
    const node = container.firstElementChild as HTMLElement;
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 40;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 20;
    pdf.addImage(imgData, "JPEG", 20, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 20;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight + 20;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 20, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    return pdf.output("blob");
  } finally {
    document.body.removeChild(container);
  }
}

/** Upload a bill PDF and return a signed URL valid for ~1 year. */
export async function uploadBillPdfAndGetUrl(
  companyId: string,
  data: BillData,
): Promise<string> {
  const blob = await generateBillPdfBlob(data);
  const safeInvoice = data.invoice_number.replace(/[^a-zA-Z0-9_-]/g, "_");
  const path = `${companyId}/${data.type}_${safeInvoice}_${Date.now()}.pdf`;

  const { error: upErr } = await supabase.storage
    .from("invoice-attachments")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (upErr) throw upErr;

  const { data: signed, error: sErr } = await supabase.storage
    .from("invoice-attachments")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (sErr || !signed?.signedUrl) throw sErr ?? new Error("Failed to sign URL");
  return signed.signedUrl;
}
