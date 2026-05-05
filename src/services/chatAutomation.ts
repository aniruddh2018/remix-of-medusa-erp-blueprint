import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AutomationChannel = "chat" | "whatsapp";

export type AutomationIntent =
  | {
      type: "create_customer";
      confidence: number;
      data: {
        name: string;
        phone?: string;
        email?: string;
        gst_number?: string;
        address?: string;
        notes?: string;
      };
      missing: string[];
    }
  | {
      type: "create_product";
      confidence: number;
      data: {
        name: string;
        manufacturer?: string;
        mrp?: number;
        purchase_price?: number;
        sale_price?: number;
        gst_percentage?: number;
        unit?: string;
        category?: string;
      };
      missing: string[];
    }
  | {
      type: "record_payment";
      confidence: number;
      data: {
        party_name: string;
        amount?: number;
        payment_method?: string;
        notes?: string;
      };
      missing: string[];
    }
  | {
      type: "create_sale_draft";
      confidence: number;
      data: {
        customer_name: string;
        customer_phone?: string;
        items: ParsedSaleItem[];
        doctor_name?: string;
        prescription_number?: string;
        prescription_date?: string;
        notes?: string;
      };
      missing: string[];
    }
  | {
      type: "unknown";
      confidence: number;
      data: { text: string };
      missing: string[];
    };

export interface ParsedSaleItem {
  name: string;
  quantity: number;
  rate: number;
  gst_percentage: number;
  unit?: string;
}

export interface AutomationDraft {
  id: string;
  channel: AutomationChannel;
  originalText: string;
  intent: Exclude<AutomationIntent, { type: "unknown" }>;
  attachments?: AutomationAttachment[];
  createdAt: string;
}

export interface AutomationAttachment {
  kind: "prescription";
  name: string;
  type: string;
  size: number;
  file?: File;
  previewUrl?: string;
  storagePath?: string;
  publicUrl?: string;
}

export interface AutomationResult {
  title: string;
  body: string;
  recordType?: string;
  recordId?: string;
}

const moneyPattern = /(?:rs\.?|inr|₹)?\s*([0-9]+(?:\.[0-9]+)?)/i;

function compact(value: string | undefined | null) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function stripKnownFields(value: string) {
  return compact(
    value
      .replace(/\b(phone|mobile|mob|contact)\b[:\s-]*\+?[0-9\s-]{7,16}/gi, "")
      .replace(/\b(email)\b[:\s-]*[^\s,;]+@[^\s,;]+/gi, "")
      .replace(/\b(gst|gstin)\b[:\s-]*[0-9a-z]{10,20}/gi, "")
      .replace(/\b(address|addr)\b[:\s-]*.+$/i, "")
      .replace(/\b(mrp|rate|price|purchase|cost|gst|tax|unit|manufacturer|mfr|brand|category)\b[:\s-]*[^,;]+/gi, "")
  );
}

function extractPhone(text: string) {
  return compact(text.match(/\b(?:phone|mobile|mob|contact)\b[:\s-]*(\+?[0-9][0-9\s-]{7,15})/i)?.[1]);
}

function extractEmail(text: string) {
  return compact(text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]);
}

function extractGst(text: string) {
  return compact(text.match(/\b(?:gst|gstin)\b[:\s-]*([0-9a-z]{10,20})/i)?.[1]).toUpperCase();
}

function extractAfterLabel(text: string, labels: string[]) {
  const labelPattern = labels.join("|");
  const match = text.match(new RegExp(`\\b(?:${labelPattern})\\b[:\\s-]*([^,;\\n]+)`, "i"));
  return compact(match?.[1]);
}

function extractNumberAfter(text: string, labels: string[]) {
  const raw = extractAfterLabel(text, labels);
  if (raw) return Number(raw.match(moneyPattern)?.[1] || raw.match(/[0-9]+(?:\.[0-9]+)?/)?.[0]);
  return undefined;
}

function extractAmount(text: string) {
  const amount = text.match(/\b(?:amount|payment|paid|received|for)\b[:\s-]*(?:rs\.?|inr|₹)?\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1];
  if (amount) return Number(amount);
  const fallback = text.match(moneyPattern)?.[1];
  return fallback ? Number(fallback) : undefined;
}

function extractPaymentMethod(text: string) {
  const match = text.match(/\b(cash|upi|card|bank|cheque|check|neft|rtgs|imps)\b/i)?.[1];
  if (!match) return undefined;
  return match.toLowerCase() === "check" ? "cheque" : match.toLowerCase();
}

function extractPrescriptionNumber(text: string) {
  return compact(text.match(/\b(?:rx|prescription|presc|script)\s*(?:no|number|#)?\b[:\s-]*([a-z0-9/-]+)/i)?.[1]).toUpperCase();
}

function extractIsoDate(text: string) {
  const iso = text.match(/\b(20[0-9]{2}-[01]?[0-9]-[0-3]?[0-9])\b/)?.[1];
  if (iso) return iso;
  const dmy = text.match(/\b([0-3]?[0-9])[/-]([01]?[0-9])[/-](20[0-9]{2})\b/);
  if (!dmy) return undefined;
  return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
}

function extractCustomerName(text: string) {
  const direct = text.match(/\b(?:customer|client|party)\b[:\s-]*([^,;\n]+)/i)?.[1];
  if (direct) return stripKnownFields(direct);

  const forMatch = text.match(/\b(?:for|to|from)\s+([^,;\n]+?)(?:\s+\b(?:item|product|amount|paid|payment|phone|mobile|gst|email)\b|$)/i)?.[1];
  return stripKnownFields(forMatch || "");
}

function parseSaleItems(text: string): ParsedSaleItem[] {
  const itemText = text.split(/\b(?:items?|products?)\b[:\s-]*/i)[1] || text;
  return itemText
    .split(/\n|;/)
    .map((part) => compact(part))
    .filter(Boolean)
    .map((part) => {
      const quantity = Number(part.match(/\b(?:qty|quantity)\b[:\s-]*([0-9]+(?:\.[0-9]+)?)/i)?.[1] || part.match(/^([0-9]+(?:\.[0-9]+)?)\s+/)?.[1] || 1);
      const rate = Number(part.match(/\b(?:rate|price|@)\b[:\s-]*([0-9]+(?:\.[0-9]+)?)/i)?.[1] || part.match(/@\s*([0-9]+(?:\.[0-9]+)?)/)?.[1] || 0);
      const gst = Number(part.match(/\b(?:gst|tax)\b[:\s-]*([0-9]+(?:\.[0-9]+)?)/i)?.[1] || 0);
      const unit = compact(part.match(/\b(?:unit|uom)\b[:\s-]*([a-z]+)/i)?.[1]) || undefined;
      const name = stripKnownFields(
        part
          .replace(/^([0-9]+(?:\.[0-9]+)?)\s+/, "")
          .replace(/\b(?:qty|quantity|rate|price|gst|tax)\b[:\s-]*[0-9]+(?:\.[0-9]+)?/gi, "")
          .replace(/\b(?:unit|uom)\b[:\s-]*[a-z]+/gi, "")
          .replace(/@\s*[0-9]+(?:\.[0-9]+)?/g, "")
      );
      return { name, quantity, rate, gst_percentage: gst, unit };
    })
    .filter((item) => item.name);
}

export function parseAutomationText(text: string): AutomationIntent {
  const source = compact(text);
  const lower = source.toLowerCase();

  if (/\b(customer|client|party)\b/.test(lower) && /\b(add|create|new)\b/.test(lower)) {
    const name = extractCustomerName(source);
    const data = {
      name,
      phone: extractPhone(source) || undefined,
      email: extractEmail(source) || undefined,
      gst_number: extractGst(source) || undefined,
      address: extractAfterLabel(source, ["address", "addr"]) || undefined,
      notes: "Created from automation chat",
    };

    return {
      type: "create_customer",
      confidence: name ? 0.88 : 0.45,
      data,
      missing: name ? [] : ["customer name"],
    };
  }

  if (/\b(product|item|medicine|sku)\b/.test(lower) && /\b(add|create|new)\b/.test(lower)) {
    const explicitName = source.match(/\b(?:product|item|medicine|sku)\b[:\s-]*([^,;\n]+)/i)?.[1];
    const name = stripKnownFields(explicitName || source.replace(/\b(add|create|new)\b/gi, ""));
    const mrp = extractNumberAfter(source, ["mrp", "rate", "price"]);
    const purchasePrice = extractNumberAfter(source, ["purchase", "cost"]);
    const gst = extractNumberAfter(source, ["gst", "tax"]);
    const data = {
      name,
      manufacturer: extractAfterLabel(source, ["manufacturer", "mfr", "brand"]) || "Unknown",
      mrp,
      purchase_price: purchasePrice ?? mrp,
      sale_price: extractNumberAfter(source, ["sale"]) ?? mrp,
      gst_percentage: gst ?? 0,
      unit: extractAfterLabel(source, ["unit"]) || "pcs",
      category: extractAfterLabel(source, ["category"]) || undefined,
    };

    return {
      type: "create_product",
      confidence: name ? 0.82 : 0.42,
      data,
      missing: [
        !name && "product name",
        !data.mrp && "MRP or price",
        !data.purchase_price && "purchase price",
      ].filter(Boolean) as string[],
    };
  }

  if (/\b(payment|paid|received)\b/.test(lower)) {
    const partyName =
      source.match(/\b(?:from|by|customer|party)\b[:\s-]*([^,;\n]+?)(?:\s+\b(?:amount|paid|payment|via|mode)\b|$)/i)?.[1] ||
      extractCustomerName(source);
    const amount = extractAmount(source);

    return {
      type: "record_payment",
      confidence: partyName && amount ? 0.82 : 0.5,
      data: {
        party_name: stripKnownFields(partyName),
        amount,
        payment_method: extractPaymentMethod(source) || "cash",
        notes: "Recorded from automation chat",
      },
      missing: [
        !partyName && "customer or party name",
        !amount && "payment amount",
      ].filter(Boolean) as string[],
    };
  }

  if (/\b(sale|sales|order|invoice|bill)\b/.test(lower)) {
    const customerName = extractCustomerName(source);
    const items = parseSaleItems(source);

    return {
      type: "create_sale_draft",
      confidence: customerName && items.length > 0 ? 0.76 : 0.42,
      data: {
        customer_name: customerName,
        customer_phone: extractPhone(source) || undefined,
        items,
        doctor_name: extractAfterLabel(source, ["doctor", "dr"]) || undefined,
        prescription_number: extractPrescriptionNumber(source) || undefined,
        prescription_date: extractIsoDate(source) || undefined,
        notes: "Sales draft created from automation chat. Verify stock and batches before dispatch.",
      },
      missing: [
        !customerName && "customer name",
        items.length === 0 && "sale item",
        items.some((item) => !item.rate) && "rate for every item",
      ].filter(Boolean) as string[],
    };
  }

  return {
    type: "unknown",
    confidence: 0.1,
    data: { text: source },
    missing: ["supported command"],
  };
}

export function buildDraft(
  channel: AutomationChannel,
  text: string,
  intent: Exclude<AutomationIntent, { type: "unknown" }>,
  attachments: AutomationAttachment[] = []
): AutomationDraft {
  return {
    id: crypto.randomUUID(),
    channel,
    originalText: text,
    intent,
    attachments,
    createdAt: new Date().toISOString(),
  };
}

export function describeIntent(intent: Exclude<AutomationIntent, { type: "unknown" }>) {
  if (intent.type === "create_customer") {
    return [
      `Create customer: ${intent.data.name}`,
      intent.data.phone && `Phone: ${intent.data.phone}`,
      intent.data.email && `Email: ${intent.data.email}`,
      intent.data.gst_number && `GSTIN: ${intent.data.gst_number}`,
      intent.data.address && `Address: ${intent.data.address}`,
    ].filter(Boolean).join("\n");
  }

  if (intent.type === "create_product") {
    return [
      `Create product: ${intent.data.name}`,
      `Manufacturer: ${intent.data.manufacturer || "Unknown"}`,
      `MRP: ${intent.data.mrp}`,
      `Purchase price: ${intent.data.purchase_price}`,
      `GST: ${intent.data.gst_percentage || 0}%`,
      `Unit: ${intent.data.unit || "pcs"}`,
    ].join("\n");
  }

  if (intent.type === "record_payment") {
    return [
      `Record payment from: ${intent.data.party_name}`,
      `Amount: Rs ${intent.data.amount}`,
      `Method: ${intent.data.payment_method || "cash"}`,
    ].join("\n");
  }

  const items = intent.data.items
    .map((item) => `${item.quantity} ${item.unit || "unit"} x ${item.name} @ Rs ${item.rate} GST ${item.gst_percentage}%`)
    .join("\n");
  return [
    `Create sales draft for: ${intent.data.customer_name}`,
    intent.data.customer_phone && `Phone: ${intent.data.customer_phone}`,
    intent.data.doctor_name && `Doctor: ${intent.data.doctor_name}`,
    intent.data.prescription_number && `Rx: ${intent.data.prescription_number}`,
    intent.data.prescription_date && `Rx date: ${intent.data.prescription_date}`,
    items,
  ].filter(Boolean).join("\n");
}

async function getNextInvoiceNumber(supabase: SupabaseClient<Database>, companyId: string) {
  const { data, error } = await supabase.rpc("get_next_invoice_number", {
    _company_id: companyId,
    _prefix: "AUTO",
  });
  if (!error && data) return data as string;
  return `AUTO-${Date.now()}`;
}

export async function executeAutomationDraft(
  supabase: SupabaseClient<Database>,
  draft: AutomationDraft,
  companyId: string,
  userId?: string
): Promise<AutomationResult> {
  const { intent } = draft;

  if (intent.type === "create_customer") {
    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: intent.data.name,
        phone: intent.data.phone || null,
        email: intent.data.email || null,
        gst_number: intent.data.gst_number || null,
        address: intent.data.address || null,
        notes: intent.data.notes || null,
        company_id: companyId,
      })
      .select("id")
      .single();

    if (error) throw error;
    return { title: "Customer created", body: `${intent.data.name} is now in customers.`, recordType: "customers", recordId: data.id };
  }

  if (intent.type === "create_product") {
    const { data, error } = await supabase
      .from("products")
      .insert({
        name: intent.data.name,
        manufacturer: intent.data.manufacturer || "Unknown",
        mrp: intent.data.mrp || 0,
        purchase_price: intent.data.purchase_price || intent.data.mrp || 0,
        sale_price: intent.data.sale_price || intent.data.mrp || 0,
        gst_percentage: intent.data.gst_percentage || 0,
        unit: intent.data.unit || "pcs",
        category: intent.data.category || null,
        company_id: companyId,
      })
      .select("id")
      .single();

    if (error) throw error;
    return { title: "Product created", body: `${intent.data.name} is now in products.`, recordType: "products", recordId: data.id };
  }

  if (intent.type === "record_payment") {
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", companyId)
      .ilike("name", `%${intent.data.party_name}%`)
      .limit(1)
      .maybeSingle();

    const referenceId = customer?.id || crypto.randomUUID();
    const partyName = customer?.name || intent.data.party_name;
    const { data, error } = await supabase
      .from("payments")
      .insert({
        amount: intent.data.amount || 0,
        party_name: partyName,
        party_type: "customer",
        payment_type: "received",
        payment_method: intent.data.payment_method || "cash",
        reference_id: referenceId,
        reference_number: customer ? `CUSTOMER-${customer.id.slice(0, 8)}` : "UNLINKED",
        reference_type: customer ? "customer" : "manual",
        notes: intent.data.notes || null,
        created_by: userId || null,
        company_id: companyId,
      })
      .select("id")
      .single();

    if (error) throw error;
    return { title: "Payment recorded", body: `Rs ${intent.data.amount} received from ${partyName}.`, recordType: "payments", recordId: data.id };
  }

  const prescriptionAttachment = draft.attachments?.find((attachment) => attachment.kind === "prescription");
  let prescriptionImageUrl: string | null = null;
  let prescriptionImagePath: string | null = null;

  if (prescriptionAttachment?.file) {
    const extension = prescriptionAttachment.name.split(".").pop() || "jpg";
    prescriptionImagePath = `${companyId}/${draft.id}/prescription.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("prescriptions")
      .upload(prescriptionImagePath, prescriptionAttachment.file, {
        contentType: prescriptionAttachment.type || "image/jpeg",
        upsert: true,
      });
    if (uploadError) throw uploadError;
    const { data: publicData } = supabase.storage.from("prescriptions").getPublicUrl(prescriptionImagePath);
    prescriptionImageUrl = publicData.publicUrl;
  }

  const subtotal = intent.data.items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const gstAmount = intent.data.items.reduce((sum, item) => sum + item.quantity * item.rate * (item.gst_percentage / 100), 0);
  const totalAmount = subtotal + gstAmount;
  const invoiceNumber = await getNextInvoiceNumber(supabase, companyId);
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, phone, address, gst_number")
    .eq("company_id", companyId)
    .ilike("name", `%${intent.data.customer_name}%`)
    .limit(1)
    .maybeSingle();

  const lineNotes = intent.data.items
    .map((item) => `${item.quantity} ${item.unit || "unit"} x ${item.name} @ Rs ${item.rate}, GST ${item.gst_percentage}%`)
    .join("; ");
  const automationNotes = [
    intent.data.notes,
    `Source: ${draft.channel}`,
    `Original message: ${draft.originalText}`,
    `Items: ${lineNotes}`,
    prescriptionImageUrl && `Prescription image: ${prescriptionImageUrl}`,
  ].filter(Boolean).join("\n");

  const { data, error } = await supabase
    .from("sales_orders")
    .insert({
      invoice_number: invoiceNumber,
      customer_name: customer?.name || intent.data.customer_name,
      customer_phone: customer?.phone || intent.data.customer_phone || null,
      customer_address: customer?.address || null,
      customer_id: customer?.id || null,
      customer_gstin: customer?.gst_number || null,
      prescription_number: intent.data.prescription_number || null,
      prescription_date: intent.data.prescription_date || null,
      doctor_name: intent.data.doctor_name || null,
      prescription_image_url: prescriptionImageUrl,
      automation_source: draft.channel,
      automation_payload: {
        draft_id: draft.id,
        original_text: draft.originalText,
        parser_confidence: intent.confidence,
        items: intent.data.items,
        prescription_image_path: prescriptionImagePath,
      },
      notes: automationNotes,
      total_amount: totalAmount,
      gst_amount: gstAmount,
      discount_amount: 0,
      status: "pending",
      payment_status: "unpaid",
      created_by: userId || null,
      company_id: companyId,
    })
    .select("id")
    .single();

  if (error) throw error;
  return {
    title: "Sales order draft published",
    body: `${invoiceNumber} is saved as a pending sales order for review. Confirm it from Sales after stock, batch, and prescription checks.`,
    recordType: "sales_orders",
    recordId: data.id,
  };
}
