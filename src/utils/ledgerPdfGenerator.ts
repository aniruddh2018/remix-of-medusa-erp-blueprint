import { format } from "date-fns";

interface LedgerTransaction {
  date: string;
  type: string;
  ref: string;
  amount: number;
  direction: "debit" | "credit";
}

interface LedgerEntry {
  name: string;
  totalSales?: number;
  totalReceived?: number;
  totalPurchase?: number;
  totalPaid?: number;
  totalDebit?: number;
  totalCredit?: number;
  balance: number;
  transactions: LedgerTransaction[];
}

interface CompanyInfo {
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_gstin: string;
}

function numberToWords(num: number): string {
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const scales = ["", "Thousand", "Lakh", "Crore"];

  const abs = Math.abs(Math.round(num));
  if (abs === 0) return "Zero";

  let str = "";
  const parts: number[] = [];
  let n = abs;
  parts.push(n % 1000); n = Math.floor(n / 1000);
  while (n > 0) { parts.push(n % 100); n = Math.floor(n / 100); }

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p === 0) continue;
    let w = "";
    if (p >= 100) { w += ones[Math.floor(p / 100)] + " Hundred "; const rem = p % 100; if (rem > 0) { if (rem < 20) w += ones[rem]; else w += tens[Math.floor(rem / 10)] + " " + ones[rem % 10]; } }
    else if (p < 20) w = ones[p];
    else w = tens[Math.floor(p / 10)] + " " + ones[p % 10];
    str += w.trim() + " " + scales[i] + " ";
  }

  return (num < 0 ? "Minus " : "") + str.trim() + " Rupees Only";
}

export function generateLedgerPDF(
  type: "customer" | "supplier",
  entry: LedgerEntry,
  company: CompanyInfo,
  periodLabel: string
): void {
  const isCustomer = type === "customer";
  const partyLabel = isCustomer ? "Customer" : "Supplier";

  let runningBalance = 0;
  const txRows = entry.transactions.map((t) => {
    const debit = t.direction === "debit" ? t.amount : 0;
    const credit = t.direction === "credit" ? t.amount : 0;
    runningBalance += debit - credit;
    return `
      <tr>
        <td>${format(new Date(t.date), "dd/MM/yyyy")}</td>
        <td>${t.type}</td>
        <td>${t.ref || "-"}</td>
        <td class="num">${debit > 0 ? "₹" + debit.toFixed(2) : ""}</td>
        <td class="num">${credit > 0 ? "₹" + credit.toFixed(2) : ""}</td>
        <td class="num">${runningBalance >= 0 ? "₹" + runningBalance.toFixed(2) : "-₹" + Math.abs(runningBalance).toFixed(2)}</td>
      </tr>`;
  }).join("");

  const totalDebit = entry.transactions.filter(t => t.direction === "debit").reduce((s, t) => s + t.amount, 0);
  const totalCredit = entry.transactions.filter(t => t.direction === "credit").reduce((s, t) => s + t.amount, 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${partyLabel} Ledger - ${entry.name}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; background: #fff; color: #333; font-size: 13px; }
.page { max-width: 800px; margin: 0 auto; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0d9488; padding-bottom: 16px; margin-bottom: 16px; }
.company h1 { font-size: 20px; color: #0d9488; margin-bottom: 4px; }
.company p { font-size: 11px; color: #666; }
.title-block { text-align: right; }
.title-block h2 { font-size: 16px; color: #333; }
.title-block p { font-size: 11px; color: #888; margin-top: 2px; }
.party-box { display: flex; justify-content: space-between; background: #f9f9f9; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; }
.party-box h3 { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 6px; }
.party-box .name { font-size: 15px; font-weight: 700; color: #333; }
.summary-box { text-align: right; }
.summary-box .amount { font-size: 18px; font-weight: 700; }
.summary-box .amount.due { color: #dc2626; }
.summary-box .amount.clear { color: #16a34a; }
table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
th { background: #f1f5f9; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
td { padding: 7px 8px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
.num { text-align: right; font-family: monospace; font-size: 12px; }
th.num { text-align: right; }
tr.total { font-weight: 700; background: #f8fafc; border-top: 2px solid #0d9488; }
tr.total td { padding-top: 10px; }
.words { font-size: 11px; color: #666; margin-bottom: 16px; padding: 8px 12px; background: #fefce8; border-radius: 4px; }
.footer { text-align: center; font-size: 10px; color: #aaa; margin-top: 20px; padding-top: 12px; border-top: 1px solid #eee; }
@media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="company">
      <h1>${company.company_name || "My Business"}</h1>
      ${company.company_address ? `<p>${company.company_address}</p>` : ""}
      ${company.company_phone ? `<p>Ph: ${company.company_phone}</p>` : ""}
      ${company.company_gstin ? `<p>GSTIN: ${company.company_gstin}</p>` : ""}
    </div>
    <div class="title-block">
      <h2>${partyLabel} Ledger</h2>
      <p>Period: ${periodLabel}</p>
      <p>Generated: ${format(new Date(), "dd MMM yyyy")}</p>
    </div>
  </div>

  <div class="party-box">
    <div>
      <h3>${partyLabel} Details</h3>
      <div class="name">${entry.name}</div>
      <p style="font-size:11px;color:#888;margin-top:4px;">${isCustomer ? "Total Sales" : "Total Purchases"}: ₹${(isCustomer ? (entry.totalSales ?? entry.totalDebit ?? 0) : (entry.totalPurchase ?? entry.totalCredit ?? 0)).toFixed(2)}</p>
      <p style="font-size:11px;color:#888;">${isCustomer ? "Total Received" : "Total Paid"}: ₹${(isCustomer ? (entry.totalReceived ?? entry.totalCredit ?? 0) : (entry.totalPaid ?? entry.totalDebit ?? 0)).toFixed(2)}</p>
    </div>
    <div class="summary-box">
      <h3>Outstanding Balance</h3>
      <div class="amount ${entry.balance > 0 ? "due" : "clear"}">₹${Math.abs(entry.balance).toFixed(2)}</div>
      <p style="font-size:10px;color:#888;margin-top:4px;">${entry.balance > 0 ? (isCustomer ? "Receivable" : "Payable") : "Settled"}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Reference</th>
        <th class="num">Debit (₹)</th>
        <th class="num">Credit (₹)</th>
        <th class="num">Balance (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${txRows}
      <tr class="total">
        <td colspan="3">Total</td>
        <td class="num">₹${totalDebit.toFixed(2)}</td>
        <td class="num">₹${totalCredit.toFixed(2)}</td>
        <td class="num">₹${Math.abs(entry.balance).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div class="words"><strong>Balance in words:</strong> ${numberToWords(Math.abs(entry.balance))}</div>

  <div class="footer">
    This is a computer-generated document. • ${company.company_name || "My Business"}
  </div>
</div>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  }
}
