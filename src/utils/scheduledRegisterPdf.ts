import { format } from "date-fns";

interface RegisterEntry {
  id: string;
  transaction_date: string;
  transaction_type: string;
  quantity: number;
  balance_quantity: number;
  patient_name: string | null;
  doctor_name: string | null;
  doctor_registration_number: string | null;
  prescription_number: string | null;
  notes: string | null;
  products: { name: string; strength?: string | null; drug_schedule: string } | null;
  inventory_batches: { batch_number: string } | null;
}

interface CompanyInfo {
  name?: string;
  address?: string;
  drug_license?: string;
  gstin?: string;
}

const SCHEDULE_LABELS: Record<string, string> = {
  schedule_h: "Schedule H",
  schedule_h1: "Schedule H1",
  schedule_x: "Schedule X",
  narcotic: "Narcotic / NRX",
};

export function generateScheduledRegisterPdf(
  entries: RegisterEntry[],
  company: CompanyInfo,
  filterLabel: string,
) {
  // Group by product+batch
  const groups = new Map<string, { product: string; schedule: string; batch: string; rows: RegisterEntry[] }>();
  entries.forEach((e) => {
    const productName = e.products?.name || "Unknown";
    const strength = e.products?.strength ? ` ${e.products.strength}` : "";
    const batch = e.inventory_batches?.batch_number || "—";
    const key = `${productName}${strength}__${batch}`;
    if (!groups.has(key)) {
      groups.set(key, {
        product: `${productName}${strength}`,
        schedule: SCHEDULE_LABELS[e.products?.drug_schedule || ""] || e.products?.drug_schedule || "",
        batch,
        rows: [],
      });
    }
    groups.get(key)!.rows.push(e);
  });

  // Sort each group by date asc
  groups.forEach((g) => g.rows.sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()));

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Form III — Scheduled Drug Register</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: Arial, sans-serif; font-size: 10px; color: #000; margin: 0; }
    h1 { text-align: center; font-size: 16px; margin: 0 0 4px; text-transform: uppercase; }
    h2 { text-align: center; font-size: 12px; margin: 0 0 8px; font-weight: normal; }
    .company { text-align: center; margin-bottom: 8px; }
    .company .name { font-weight: bold; font-size: 13px; }
    .company .meta { font-size: 10px; color: #333; }
    .filter { text-align: right; font-size: 9px; margin-bottom: 8px; color: #555; }
    .group { margin-bottom: 16px; page-break-inside: avoid; }
    .group-header { background: #e8e8e8; padding: 4px 6px; border: 1px solid #888; font-weight: bold; font-size: 11px; }
    .group-header .schedule { float: right; font-style: italic; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #888; padding: 3px 5px; vertical-align: top; }
    th { background: #f4f4f4; font-size: 9px; text-align: left; }
    td { font-size: 9px; }
    .num { text-align: right; font-family: monospace; }
    .center { text-align: center; }
    .footer { margin-top: 24px; display: flex; justify-content: space-between; font-size: 10px; }
    .sign-box { width: 30%; border-top: 1px solid #000; padding-top: 4px; text-align: center; }
    @media print { .no-print { display: none; } }
    .no-print { padding: 8px; background: #f0f0f0; text-align: center; }
    .no-print button { padding: 6px 16px; margin: 0 4px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button onclick="window.close()">Close</button>
  </div>

  <h1>Scheduled Drug Register — Form III</h1>
  <h2>(Sale &amp; Receipt of controlled substances under Drugs &amp; Cosmetics Rules)</h2>

  <div class="company">
    <div class="name">${escapeHtml(company.name || "")}</div>
    <div class="meta">
      ${escapeHtml(company.address || "")}
      ${company.drug_license ? ` | DL: ${escapeHtml(company.drug_license)}` : ""}
      ${company.gstin ? ` | GSTIN: ${escapeHtml(company.gstin)}` : ""}
    </div>
  </div>

  <div class="filter">Filter: <strong>${escapeHtml(filterLabel)}</strong> &nbsp;•&nbsp; Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} &nbsp;•&nbsp; Total entries: ${entries.length}</div>

  ${
    groups.size === 0
      ? `<p style="text-align:center; padding: 40px; color:#888;">No register entries for the selected filter.</p>`
      : Array.from(groups.values())
          .map(
            (g) => `
    <div class="group">
      <div class="group-header">
        ${escapeHtml(g.product)} &nbsp;•&nbsp; Batch: <span style="font-family:monospace">${escapeHtml(g.batch)}</span>
        <span class="schedule">${escapeHtml(g.schedule)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:5%">S.No</th>
            <th style="width:9%">Date</th>
            <th style="width:8%">Type</th>
            <th style="width:7%" class="num">Qty</th>
            <th style="width:8%" class="num">Balance</th>
            <th style="width:14%">Patient</th>
            <th style="width:18%">Doctor (Reg. No.)</th>
            <th style="width:11%">Rx Number</th>
            <th style="width:20%">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${g.rows
            .map(
              (r, i) => `
            <tr>
              <td class="center">${i + 1}</td>
              <td>${format(new Date(r.transaction_date), "dd-MM-yyyy")}</td>
              <td>${r.transaction_type === "sale" ? "Sale" : "Receipt"}</td>
              <td class="num">${r.transaction_type === "sale" ? "-" : "+"}${r.quantity}</td>
              <td class="num">${r.balance_quantity}</td>
              <td>${escapeHtml(r.patient_name || "—")}</td>
              <td>${escapeHtml(r.doctor_name || "—")}${r.doctor_registration_number ? `<br><span style="font-size:8px;color:#555">Reg: ${escapeHtml(r.doctor_registration_number)}</span>` : ""}</td>
              <td>${escapeHtml(r.prescription_number || "—")}</td>
              <td>${escapeHtml(r.notes || "")}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`,
          )
          .join("")
  }

  <div class="footer">
    <div class="sign-box">Pharmacist Signature</div>
    <div class="sign-box">Date</div>
    <div class="sign-box">Authorised Signatory</div>
  </div>
</body>
</html>`;

  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) {
    alert("Pop-up blocked. Please allow pop-ups to download the register.");
    return;
  }
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
