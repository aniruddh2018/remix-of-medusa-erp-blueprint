import { supabase } from "@/integrations/supabase/client";

type NoteKind = "credit" | "debit";

interface CompanyLite {
  company_name: string;
  company_address?: string | null;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
}

async function loadCompany(companyId: string): Promise<CompanyLite> {
  const { data } = await supabase
    .from("invoice_settings")
    .select("company_name, company_address, gstin, phone, email")
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as CompanyLite) || { company_name: "" };
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function printNote(
  kind: NoteKind,
  noteId: string,
  companyId: string,
) {
  const noteTable = kind === "credit" ? "credit_notes" : "debit_notes";
  const itemsTable = kind === "credit" ? "credit_note_items" : "debit_note_items";
  const numberField = kind === "credit" ? "credit_note_number" : "debit_note_number";
  const originalField = kind === "credit" ? "original_invoice_number" : "original_order_number";
  const partyField = kind === "credit" ? "customer_name" : "supplier_name";

  const [{ data: note }, { data: items }, company] = await Promise.all([
    supabase.from(noteTable as never).select("*").eq("id", noteId).single() as never,
    supabase.from(itemsTable as never).select("*").eq(kind === "credit" ? "credit_note_id" : "debit_note_id", noteId) as never,
    loadCompany(companyId),
  ]);

  if (!note) return;
  const rows = (items as Array<Record<string, unknown>>) || [];

  const label = kind === "credit" ? "Credit Note" : "Debit Note";
  const partyLabel = kind === "credit" ? "Customer" : "Supplier";
  const totalAmount = Number((note as Record<string, unknown>).total_amount) || 0;
  const gstAmount = Number((note as Record<string, unknown>).gst_amount) || 0;
  const n = note as Record<string, unknown>;

  const itemsHtml = rows.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(it.product_name)}</td>
      <td>${esc(it.batch_number ?? "-")}</td>
      <td class="r">${Number(it.quantity ?? 0)}</td>
      <td class="r">₹${Number(it.unit_price ?? 0).toFixed(2)}</td>
      <td class="r">${Number(it.gst_percentage ?? 0)}%</td>
      <td class="r">₹${Number(it.total_price ?? 0).toFixed(2)}</td>
    </tr>`).join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${label} ${esc(n[numberField])}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; padding: 24px; color: #111; font-size: 12px; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 12px; }
  .company { font-size: 11px; color: #444; }
  .title { text-align: right; }
  .title .kind { font-size: 22px; font-weight: bold; color: ${kind === "credit" ? "#c1272d" : "#a86400"}; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; font-size: 12px; }
  .meta .box { border: 1px solid #ddd; padding: 8px; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; font-size: 11px; }
  td.r, th.r { text-align: right; }
  .totals { margin-top: 12px; display: flex; justify-content: flex-end; }
  .totals table { width: 260px; }
  .footer { margin-top: 32px; font-size: 11px; color: #666; text-align: center; }
  @media print { body { padding: 12px; } .noprint { display: none; } }
</style></head>
<body>
  <div class="header">
    <div>
      <h1>${esc(company.company_name || "Company")}</h1>
      <div class="company">
        ${company.company_address ? esc(company.company_address) + "<br/>" : ""}
        ${company.phone ? "Phone: " + esc(company.phone) + " &nbsp; " : ""}
        ${company.email ? "Email: " + esc(company.email) : ""}
        ${company.gstin ? "<br/>GSTIN: " + esc(company.gstin) : ""}
      </div>
    </div>
    <div class="title">
      <div class="kind">${label.toUpperCase()}</div>
      <div><strong>${esc(n[numberField])}</strong></div>
      <div>${new Date(String(n.created_at)).toLocaleDateString("en-IN")}</div>
    </div>
  </div>

  <div class="meta">
    <div class="box">
      <div><strong>${partyLabel}:</strong> ${esc(n[partyField])}</div>
      ${kind === "credit" && n.customer_phone ? `<div>Phone: ${esc(n.customer_phone)}</div>` : ""}
    </div>
    <div class="box">
      <div><strong>Original ${kind === "credit" ? "Invoice" : "Bill"} #:</strong> ${esc(n[originalField])}</div>
      <div><strong>Reason:</strong> ${esc(n.reason)}</div>
      ${n.notes ? `<div><strong>Notes:</strong> ${esc(n.notes)}</div>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:32px">#</th>
        <th>Product</th>
        <th>Batch</th>
        <th class="r">Qty</th>
        <th class="r">Rate</th>
        <th class="r">GST</th>
        <th class="r">Amount</th>
      </tr>
    </thead>
    <tbody>${itemsHtml || `<tr><td colspan="7" style="text-align:center;color:#888">No items</td></tr>`}</tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>Subtotal</td><td class="r">₹${(totalAmount - gstAmount).toFixed(2)}</td></tr>
      <tr><td>GST</td><td class="r">₹${gstAmount.toFixed(2)}</td></tr>
      <tr><th>Total ${label} Amount</th><th class="r">₹${totalAmount.toFixed(2)}</th></tr>
    </table>
  </div>

  <div class="footer">This is a computer-generated ${label.toLowerCase()}.</div>
  <script>window.onload = () => { setTimeout(() => window.print(), 200); };</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
