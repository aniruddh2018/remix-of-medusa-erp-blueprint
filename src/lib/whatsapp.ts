/**
 * WhatsApp click-to-chat helpers.
 * No API/SDK — opens https://wa.me/<phone>?text=<message>.
 */

export type WhatsAppTemplateKey =
  | "invoice_sent"
  | "payment_reminder"
  | "purchase_order"
  | "order_status";

export interface WhatsAppTemplate {
  id?: string;
  template_key: WhatsAppTemplateKey;
  body: string;
  enabled: boolean;
}

export const DEFAULT_WA_TEMPLATES: Record<WhatsAppTemplateKey, { label: string; body: string; description: string }> = {
  invoice_sent: {
    label: "Invoice sent to customer",
    description: "Used from Sales list — sends a bill summary with a PDF download link.",
    body:
      "Hello {customer},\n\nThank you for your purchase at {company}.\nInvoice: {invoice_no}\nAmount: ₹{amount}\nDate: {date}\n\n📄 Download invoice PDF:\n{pdf_url}\n\nPlease let us know if you need anything else.",
  },
  payment_reminder: {
    label: "Payment reminder (overdue)",
    description: "Used from the Overdue Invoices card.",
    body:
      "Hello {customer},\n\nThis is a gentle reminder from {company} for invoice {invoice_no} dated {date}.\nOutstanding balance: ₹{balance} ({days_overdue} day(s) overdue).\n\nKindly arrange the payment at your earliest convenience. Thank you.",
  },
  purchase_order: {
    label: "Purchase order to supplier",
    description: "Used from Purchase Orders list — includes a PDF link of the order.",
    body:
      "Hello {supplier},\n\nPlease find our purchase order from {company}.\nPO No: {po_no}\nDate: {date}\nAmount: ₹{amount}\n\n📄 Download PO PDF:\n{pdf_url}\n\nKindly confirm receipt and expected delivery.",
  },
  order_status: {
    label: "Order confirmation / delivery update",
    description: "Used from Sales list — confirmation or delivery status.",
    body:
      "Hello {customer},\n\nYour order {invoice_no} with {company} is *{status}*.\nAmount: ₹{amount}\n\nThanks for shopping with us!",
  },
};

/** Render `{var}` placeholders. Unknown vars are left as-is. */
export function renderWhatsAppTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return body.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    if (v === null || v === undefined || v === "") return `{${key}}`;
    return String(v);
  });
}

/** Strip everything except digits, drop leading 0s. Returns null if invalid. */
export function normalizePhoneForWhatsApp(phone: string | null | undefined, defaultCountryCode = "91"): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  // If 10-digit Indian mobile (no country code), prepend default.
  if (digits.length === 10) digits = defaultCountryCode + digits;
  // Strip leading zeros
  digits = digits.replace(/^0+/, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  const text = encodeURIComponent(message);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  return isMobile
    ? `https://wa.me/${normalized}?text=${text}`
    : `https://web.whatsapp.com/send?phone=${normalized}&text=${text}`;
}

/** Opens WhatsApp. Tries the native app via `whatsapp://` first (works around
 *  browsers/extensions that block wa.me / web.whatsapp.com), and falls back to
 *  the web URL after a short delay if the app isn't installed. */
export function openWhatsApp(phone: string | null | undefined, message: string): boolean {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return false;
  const text = encodeURIComponent(message);
  const appUrl = `whatsapp://send?phone=${normalized}&text=${text}`;
  const webUrl = buildWhatsAppUrl(phone, message)!;

  // Try the native WhatsApp app first via an iframe — silently fails if not
  // installed, so we then open the web fallback.
  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = appUrl;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* noop */ }
      window.open(webUrl, "_blank", "noopener,noreferrer");
    }, 600);
  } catch {
    window.open(webUrl, "_blank", "noopener,noreferrer");
  }
  return true;
}

