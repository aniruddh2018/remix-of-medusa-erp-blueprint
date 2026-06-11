/* eslint-disable @typescript-eslint/no-explicit-any */
// ERP Action Agent — expanded
// All mutating tools go through agent_pending_actions for HITL approval.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "google/gemini-2.5-flash";
const MAX_STEPS = 10;

// ───────────────────────── Tool catalog ─────────────────────────
const tools = [
  // ───── READ ─────
  {
    type: "function",
    function: {
      name: "search_customers",
      description: "Search customers by name fragment or phone. Use BEFORE upsert_customer to avoid duplicates and to find an existing customer ID for payments.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_suppliers",
      description: "Search suppliers by name or phone. Use BEFORE upsert_supplier.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_doctors",
      description: "Search doctors by name or registration number. Use BEFORE upsert_doctor.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Search products by name fragment. Use BEFORE create_product.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_invoices",
      description: "Find sales invoices by invoice number fragment OR by customer name. Returns id, invoice_number, customer_name, total, paid_amount, balance. Use this BEFORE record_payment for a customer.",
      parameters: {
        type: "object",
        properties: {
          invoice_number: { type: "string" },
          customer_name: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_purchase_bills",
      description: "Find purchase bills by bill number or supplier name. Use BEFORE record_payment to suppliers.",
      parameters: {
        type: "object",
        properties: {
          bill_number: { type: "string" },
          supplier_name: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_outstanding",
      description: "Get total outstanding (unpaid) balance for a customer or supplier. Returns sum of invoice/bill balances.",
      parameters: {
        type: "object",
        properties: {
          party_type: { type: "string", enum: ["customer", "supplier"] },
          party_name: { type: "string" },
        },
        required: ["party_type", "party_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_sales",
      description: "List the most recent sales invoices (last 10 by default).",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", default: 10, minimum: 1, maximum: 50 } },
      },
    },
  },

  // ───── MUTATING (HITL) ─────
  {
    type: "function",
    function: {
      name: "upsert_customer",
      description: "Propose creating or updating a customer. REQUIRES HUMAN APPROVAL.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", maxLength: 200 },
          phone: { type: "string", maxLength: 20 },
          email: { type: "string", maxLength: 255 },
          address: { type: "string", maxLength: 500 },
          gst_number: { type: "string", maxLength: 20 },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_supplier",
      description: "Propose creating or updating a supplier. REQUIRES HUMAN APPROVAL.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", maxLength: 200 },
          contact_person: { type: "string", maxLength: 200 },
          phone: { type: "string", maxLength: 20 },
          email: { type: "string", maxLength: 255 },
          address: { type: "string", maxLength: 500 },
          gst_number: { type: "string", maxLength: 20 },
          drug_license_number: { type: "string", maxLength: 50 },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_doctor",
      description: "Propose creating or updating a doctor. REQUIRES HUMAN APPROVAL.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", maxLength: 200 },
          registration_number: { type: "string", maxLength: 50 },
          speciality: { type: "string", maxLength: 100 },
          phone: { type: "string", maxLength: 20 },
          email: { type: "string", maxLength: 255 },
          address: { type: "string", maxLength: 500 },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_product",
      description: "Propose creating a new product. REQUIRES HUMAN APPROVAL.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 200 },
          manufacturer: { type: "string", maxLength: 200 },
          mrp: { type: "number", minimum: 0 },
          purchase_price: { type: "number", minimum: 0 },
          gst_percentage: { type: "number", minimum: 0, maximum: 28, default: 18 },
          hsn_code: { type: "string", maxLength: 20 },
          unit: { type: "string", maxLength: 20, default: "pcs" },
          category: { type: "string", maxLength: 100 },
          strength: { type: "string", maxLength: 50 },
        },
        required: ["name", "manufacturer", "mrp", "purchase_price"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_payment",
      description: "Propose recording a payment against an existing invoice (sales) or purchase bill. REQUIRES HUMAN APPROVAL. You MUST first use search_invoices or search_purchase_bills to get the reference_id and reference_number — never guess them.",
      parameters: {
        type: "object",
        properties: {
          payment_type: { type: "string", enum: ["received", "made"], description: "received = from customer, made = to supplier" },
          reference_type: { type: "string", enum: ["sales_order", "purchase_order"] },
          reference_id: { type: "string", description: "UUID returned by search_invoices/search_purchase_bills" },
          reference_number: { type: "string" },
          party_name: { type: "string" },
          party_type: { type: "string", enum: ["customer", "supplier"] },
          amount: { type: "number", minimum: 0.01 },
          payment_method: { type: "string", enum: ["cash", "upi", "card", "bank_transfer", "cheque"], default: "cash" },
          payment_date: { type: "string", description: "YYYY-MM-DD. Omit for today." },
          cheque_number: { type: "string" },
          bank_name: { type: "string" },
          notes: { type: "string" },
        },
        required: ["payment_type", "reference_type", "reference_id", "reference_number", "party_name", "party_type", "amount"],
      },
    },
  },
];

const READ_TOOLS = new Set([
  "search_customers", "search_suppliers", "search_doctors", "search_products",
  "search_invoices", "search_purchase_bills", "get_outstanding", "list_recent_sales",
]);
const MUTATING_TOOLS = new Set([
  "upsert_customer", "upsert_supplier", "upsert_doctor", "create_product", "record_payment",
]);

// ───────────────────────── Validators ─────────────────────────
type Ok<T> = { ok: true; data: T };
type Err = { ok: false; code: string; message: string };
const ok = <T,>(data: T): Ok<T> => ({ ok: true, data });
const err = (code: string, message: string): Err => ({ ok: false, code, message });

function vCustomer(i: any): Ok<any> | Err {
  if (!i?.name?.trim()) return err("INVALID_NAME", "Customer name is required.");
  if (i.phone && !/^[+\d\s()-]{6,20}$/.test(String(i.phone))) return err("BAD_PHONE", "Phone format invalid.");
  if (i.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(i.email))) return err("BAD_EMAIL", "Email format invalid.");
  if (i.gst_number && !/^[0-9A-Z]{10,20}$/i.test(String(i.gst_number))) return err("BAD_GSTIN", "GSTIN format invalid.");
  return ok({
    id: i.id || null,
    name: i.name.trim(),
    phone: i.phone?.trim() || null,
    email: i.email?.trim() || null,
    address: i.address?.trim() || null,
    gst_number: i.gst_number?.toUpperCase()?.trim() || null,
  });
}

function vSupplier(i: any): Ok<any> | Err {
  if (!i?.name?.trim()) return err("INVALID_NAME", "Supplier name is required.");
  if (i.phone && !/^[+\d\s()-]{6,20}$/.test(String(i.phone))) return err("BAD_PHONE", "Phone format invalid.");
  if (i.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(i.email))) return err("BAD_EMAIL", "Email format invalid.");
  if (i.gst_number && !/^[0-9A-Z]{10,20}$/i.test(String(i.gst_number))) return err("BAD_GSTIN", "GSTIN format invalid.");
  return ok({
    id: i.id || null,
    name: i.name.trim(),
    contact_person: i.contact_person?.trim() || null,
    phone: i.phone?.trim() || null,
    email: i.email?.trim() || null,
    address: i.address?.trim() || null,
    gst_number: i.gst_number?.toUpperCase()?.trim() || null,
    drug_license_number: i.drug_license_number?.trim() || null,
  });
}

function vDoctor(i: any): Ok<any> | Err {
  if (!i?.name?.trim()) return err("INVALID_NAME", "Doctor name is required.");
  if (i.phone && !/^[+\d\s()-]{6,20}$/.test(String(i.phone))) return err("BAD_PHONE", "Phone format invalid.");
  if (i.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(i.email))) return err("BAD_EMAIL", "Email format invalid.");
  return ok({
    id: i.id || null,
    name: i.name.trim(),
    registration_number: i.registration_number?.trim() || null,
    speciality: i.speciality?.trim() || null,
    phone: i.phone?.trim() || null,
    email: i.email?.trim() || null,
    address: i.address?.trim() || null,
  });
}

function vProduct(i: any): Ok<any> | Err {
  if (!i?.name?.trim()) return err("INVALID_NAME", "Product name is required.");
  if (!i?.manufacturer?.trim()) return err("INVALID_MANUFACTURER", "Manufacturer is required.");
  const mrp = Number(i.mrp);
  const pp = Number(i.purchase_price);
  if (!Number.isFinite(mrp) || mrp < 0) return err("BAD_MRP", "MRP must be a non-negative number.");
  if (!Number.isFinite(pp) || pp < 0) return err("BAD_PURCHASE_PRICE", "Purchase price must be ≥0.");
  const gst = i.gst_percentage == null ? 18 : Number(i.gst_percentage);
  if (!Number.isFinite(gst) || gst < 0 || gst > 28) return err("BAD_GST", "GST percentage must be 0–28.");
  return ok({
    name: i.name.trim(),
    manufacturer: i.manufacturer.trim(),
    mrp, purchase_price: pp, gst_percentage: gst,
    hsn_code: i.hsn_code?.trim() || null,
    unit: i.unit?.trim() || "pcs",
    category: i.category?.trim() || null,
    strength: i.strength?.trim() || null,
  });
}

function vPayment(i: any): Ok<any> | Err {
  if (!["received", "made"].includes(i?.payment_type)) return err("BAD_PAYMENT_TYPE", "payment_type must be 'received' or 'made'.");
  if (!["sales_order", "purchase_order"].includes(i?.reference_type)) return err("BAD_REF_TYPE", "reference_type must be 'sales_order' or 'purchase_order'.");
  if (!i?.reference_id) return err("MISSING_REF_ID", "reference_id is required — use search_invoices first.");
  if (!i?.reference_number?.trim()) return err("MISSING_REF_NUMBER", "reference_number is required.");
  if (!i?.party_name?.trim()) return err("MISSING_PARTY", "party_name is required.");
  if (!["customer", "supplier"].includes(i?.party_type)) return err("BAD_PARTY_TYPE", "party_type must be 'customer' or 'supplier'.");
  const amount = Number(i.amount);
  if (!Number.isFinite(amount) || amount <= 0) return err("BAD_AMOUNT", "amount must be a positive number.");
  const method = i.payment_method || "cash";
  if (!["cash", "upi", "card", "bank_transfer", "cheque"].includes(method)) return err("BAD_METHOD", "payment_method invalid.");
  const date = i.payment_date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err("BAD_DATE", "payment_date must be YYYY-MM-DD.");
  return ok({
    payment_type: i.payment_type,
    reference_type: i.reference_type,
    reference_id: i.reference_id,
    reference_number: i.reference_number.trim(),
    party_name: i.party_name.trim(),
    party_type: i.party_type,
    amount,
    payment_method: method,
    payment_date: date,
    cheque_number: i.cheque_number?.trim() || null,
    bank_name: i.bank_name?.trim() || null,
    notes: i.notes?.trim() || null,
  });
}

// ───────────────────────── Gateway ─────────────────────────
async function callGateway(apiKey: string, messages: any[]) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: "auto", temperature: 0.2 }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LLM ${res.status}: ${txt.slice(0, 300)}`);
  }
  return await res.json();
}

// ───────────────────────── Read executors ─────────────────────────
async function execReadTool(supa: any, companyId: string, name: string, args: any): Promise<any> {
  try {
    if (name === "search_customers") {
      const q = String(args?.query || "").trim();
      if (!q) return { results: [] };
      const { data, error } = await supa
        .from("customers")
        .select("id, name, phone, email, address, gst_number")
        .eq("company_id", companyId)
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(8);
      if (error) return { error: error.message };
      return { results: data ?? [] };
    }
    if (name === "search_suppliers") {
      const q = String(args?.query || "").trim();
      if (!q) return { results: [] };
      const { data, error } = await supa
        .from("suppliers")
        .select("id, name, contact_person, phone, email, gst_number")
        .eq("company_id", companyId)
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(8);
      if (error) return { error: error.message };
      return { results: data ?? [] };
    }
    if (name === "search_doctors") {
      const q = String(args?.query || "").trim();
      if (!q) return { results: [] };
      const { data, error } = await supa
        .from("doctors")
        .select("id, name, registration_number, speciality, phone")
        .eq("company_id", companyId)
        .or(`name.ilike.%${q}%,registration_number.ilike.%${q}%`)
        .limit(8);
      if (error) return { error: error.message };
      return { results: data ?? [] };
    }
    if (name === "search_products") {
      const q = String(args?.query || "").trim();
      if (!q) return { results: [] };
      const { data, error } = await supa
        .from("products")
        .select("id, name, manufacturer, mrp, purchase_price, gst_percentage, unit")
        .eq("company_id", companyId)
        .ilike("name", `%${q}%`)
        .eq("deleted", false)
        .limit(8);
      if (error) return { error: error.message };
      return { results: data ?? [] };
    }
    if (name === "search_invoices") {
      const num = String(args?.invoice_number || "").trim();
      const cust = String(args?.customer_name || "").trim();
      if (!num && !cust) return { results: [], hint: "Provide invoice_number or customer_name." };
      let q = supa
        .from("sales_orders")
        .select("id, invoice_number, customer_name, total_amount, paid_amount, payment_status, order_date")
        .eq("company_id", companyId)
        .order("order_date", { ascending: false })
        .limit(15);
      if (num) q = q.ilike("invoice_number", `%${num}%`);
      if (cust) q = q.ilike("customer_name", `%${cust}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return {
        results: (data ?? []).map((r: any) => ({
          id: r.id,
          invoice_number: r.invoice_number,
          customer_name: r.customer_name,
          total: Number(r.total_amount || 0),
          paid: Number(r.paid_amount || 0),
          balance: Number(r.total_amount || 0) - Number(r.paid_amount || 0),
          status: r.payment_status,
          date: r.order_date,
        })),
      };
    }
    if (name === "search_purchase_bills") {
      const num = String(args?.bill_number || "").trim();
      const sup = String(args?.supplier_name || "").trim();
      if (!num && !sup) return { results: [], hint: "Provide bill_number or supplier_name." };
      let q = supa
        .from("purchase_orders")
        .select("id, bill_number, supplier_name, total_amount, paid_amount, payment_status, order_date")
        .eq("company_id", companyId)
        .order("order_date", { ascending: false })
        .limit(15);
      if (num) q = q.ilike("bill_number", `%${num}%`);
      if (sup) q = q.ilike("supplier_name", `%${sup}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return {
        results: (data ?? []).map((r: any) => ({
          id: r.id,
          bill_number: r.bill_number,
          supplier_name: r.supplier_name,
          total: Number(r.total_amount || 0),
          paid: Number(r.paid_amount || 0),
          balance: Number(r.total_amount || 0) - Number(r.paid_amount || 0),
          status: r.payment_status,
          date: r.order_date,
        })),
      };
    }
    if (name === "get_outstanding") {
      const pt = String(args?.party_type);
      const pn = String(args?.party_name || "").trim();
      if (!pn) return { error: "party_name required" };
      const table = pt === "supplier" ? "purchase_orders" : "sales_orders";
      const col = pt === "supplier" ? "supplier_name" : "customer_name";
      const { data, error } = await supa
        .from(table)
        .select(`id, total_amount, paid_amount, ${pt === "supplier" ? "bill_number" : "invoice_number"}`)
        .eq("company_id", companyId)
        .ilike(col, `%${pn}%`);
      if (error) return { error: error.message };
      const rows = data ?? [];
      const outstanding = rows.reduce((s: number, r: any) => s + (Number(r.total_amount || 0) - Number(r.paid_amount || 0)), 0);
      return { party_type: pt, party_name: pn, outstanding, invoice_count: rows.length };
    }
    if (name === "list_recent_sales") {
      const limit = Math.min(50, Math.max(1, Number(args?.limit) || 10));
      const { data, error } = await supa
        .from("sales_orders")
        .select("id, invoice_number, customer_name, total_amount, paid_amount, payment_status, order_date")
        .eq("company_id", companyId)
        .order("order_date", { ascending: false })
        .limit(limit);
      if (error) return { error: error.message };
      return { results: data ?? [] };
    }
  } catch (e: any) {
    return { error: String(e?.message || e) };
  }
  return { error: `Unknown read tool: ${name}` };
}

// ───────────────────────── Preview builders ─────────────────────────
async function buildPreview(supa: any, companyId: string, name: string, data: any): Promise<any> {
  if (name === "upsert_customer") {
    if (data.id) {
      const { data: existing } = await supa.from("customers")
        .select("id, name, phone, email, address, gst_number")
        .eq("id", data.id).eq("company_id", companyId).maybeSingle();
      return { kind: "update_customer", before: existing, after: data };
    }
    let dup: any[] = [];
    if (data.phone) {
      const r = await supa.from("customers").select("id, name, phone")
        .eq("company_id", companyId).ilike("phone", `%${data.phone}%`).limit(3);
      dup = r.data ?? [];
    }
    return { kind: "create_customer", new: data, possible_duplicates: dup };
  }
  if (name === "upsert_supplier") {
    if (data.id) {
      const { data: existing } = await supa.from("suppliers")
        .select("id, name, contact_person, phone, email, gst_number")
        .eq("id", data.id).eq("company_id", companyId).maybeSingle();
      return { kind: "update_supplier", before: existing, after: data };
    }
    let dup: any[] = [];
    if (data.phone) {
      const r = await supa.from("suppliers").select("id, name, phone")
        .eq("company_id", companyId).ilike("phone", `%${data.phone}%`).limit(3);
      dup = r.data ?? [];
    }
    return { kind: "create_supplier", new: data, possible_duplicates: dup };
  }
  if (name === "upsert_doctor") {
    if (data.id) {
      const { data: existing } = await supa.from("doctors")
        .select("id, name, registration_number, speciality, phone")
        .eq("id", data.id).eq("company_id", companyId).maybeSingle();
      return { kind: "update_doctor", before: existing, after: data };
    }
    return { kind: "create_doctor", new: data, possible_duplicates: [] };
  }
  if (name === "create_product") {
    const { data: dup } = await supa.from("products")
      .select("id, name, manufacturer, mrp")
      .eq("company_id", companyId).ilike("name", `%${data.name}%`)
      .eq("deleted", false).limit(3);
    return { kind: "create_product", new: data, possible_duplicates: dup ?? [] };
  }
  if (name === "record_payment") {
    // Fetch the parent invoice/bill to show before/after balance
    const tbl = data.reference_type === "purchase_order" ? "purchase_orders" : "sales_orders";
    const { data: ref } = await supa.from(tbl)
      .select("id, total_amount, paid_amount")
      .eq("id", data.reference_id).eq("company_id", companyId).maybeSingle();
    const total = Number(ref?.total_amount || 0);
    const paid = Number(ref?.paid_amount || 0);
    const balance = total - paid;
    return {
      kind: "record_payment",
      payment: data,
      reference: {
        total, paid, balance,
        new_paid: paid + data.amount,
        new_balance: balance - data.amount,
        overpay: data.amount > balance + 0.01,
      },
    };
  }
  return { kind: name, data };
}

// ───────────────────────── Commit handlers ─────────────────────────
async function commitAction(
  supa: any, companyId: string, userId: string, row: any,
): Promise<{ ok: boolean; output?: any; error?: string; code?: string }> {
  const t = row.tool_name as string;
  const input = row.validated_input;

  try {
    if (t === "upsert_customer") {
      if (input.id) {
        const { data, error } = await supa.from("customers")
          .update({ name: input.name, phone: input.phone, email: input.email, address: input.address, gst_number: input.gst_number })
          .eq("id", input.id).eq("company_id", companyId).select().single();
        if (error) return { ok: false, error: error.message, code: "DB_UPDATE" };
        return { ok: true, output: { customer: data, action: "updated" } };
      }
      const { data, error } = await supa.from("customers").insert({
        company_id: companyId, name: input.name, phone: input.phone, email: input.email,
        address: input.address, gst_number: input.gst_number, notes: "Created via Action Agent",
      }).select().single();
      if (error) return { ok: false, error: error.message, code: "DB_INSERT" };
      return { ok: true, output: { customer: data, action: "created" } };
    }

    if (t === "upsert_supplier") {
      if (input.id) {
        const { data, error } = await supa.from("suppliers")
          .update({
            name: input.name, contact_person: input.contact_person, phone: input.phone,
            email: input.email, address: input.address, gst_number: input.gst_number,
            drug_license_number: input.drug_license_number,
          })
          .eq("id", input.id).eq("company_id", companyId).select().single();
        if (error) return { ok: false, error: error.message, code: "DB_UPDATE" };
        return { ok: true, output: { supplier: data, action: "updated" } };
      }
      const { data, error } = await supa.from("suppliers").insert({
        company_id: companyId, name: input.name, contact_person: input.contact_person,
        phone: input.phone, email: input.email, address: input.address,
        gst_number: input.gst_number, drug_license_number: input.drug_license_number,
      }).select().single();
      if (error) return { ok: false, error: error.message, code: "DB_INSERT" };
      return { ok: true, output: { supplier: data, action: "created" } };
    }

    if (t === "upsert_doctor") {
      if (input.id) {
        const { data, error } = await supa.from("doctors")
          .update({
            name: input.name, registration_number: input.registration_number,
            speciality: input.speciality, phone: input.phone, email: input.email, address: input.address,
          })
          .eq("id", input.id).eq("company_id", companyId).select().single();
        if (error) return { ok: false, error: error.message, code: "DB_UPDATE" };
        return { ok: true, output: { doctor: data, action: "updated" } };
      }
      const { data, error } = await supa.from("doctors").insert({
        company_id: companyId, name: input.name, registration_number: input.registration_number,
        speciality: input.speciality, phone: input.phone, email: input.email, address: input.address,
      }).select().single();
      if (error) return { ok: false, error: error.message, code: "DB_INSERT" };
      return { ok: true, output: { doctor: data, action: "created" } };
    }

    if (t === "create_product") {
      const { data, error } = await supa.from("products").insert({
        company_id: companyId, name: input.name, manufacturer: input.manufacturer,
        mrp: input.mrp, purchase_price: input.purchase_price, gst_percentage: input.gst_percentage,
        hsn_code: input.hsn_code, unit: input.unit, category: input.category, strength: input.strength,
      }).select().single();
      if (error) return { ok: false, error: error.message, code: "DB_INSERT" };
      return { ok: true, output: { product: data, action: "created" } };
    }

    if (t === "record_payment") {
      const { data, error } = await supa.from("payments").insert({
        company_id: companyId,
        payment_type: input.payment_type,
        reference_type: input.reference_type,
        reference_id: input.reference_id,
        reference_number: input.reference_number,
        party_name: input.party_name,
        party_type: input.party_type,
        amount: input.amount,
        payment_method: input.payment_method,
        payment_date: input.payment_date,
        cheque_number: input.cheque_number,
        bank_name: input.bank_name,
        notes: input.notes,
        created_by: userId,
      }).select().single();
      if (error) return { ok: false, error: error.message, code: "DB_INSERT" };
      return { ok: true, output: { payment: data, action: "recorded" } };
    }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e), code: "COMMIT_EXCEPTION" };
  }
  return { ok: false, error: `Unknown tool ${t}`, code: "UNKNOWN_TOOL" };
}

// ───────────────────────── Helpers ─────────────────────────
async function proposeAction(
  supa: any,
  ctx: { conversation_id: string; user_id: string; company_id: string },
  tool_name: string, validated_input: any, preview: any,
): Promise<any> {
  const { data, error } = await supa.from("agent_pending_actions").insert({
    conversation_id: ctx.conversation_id,
    user_id: ctx.user_id,
    company_id: ctx.company_id,
    tool_name, validated_input, preview,
  }).select("id").single();
  if (error) return { error: error.message };
  await supa.from("agent_audit_log").insert({
    user_id: ctx.user_id, company_id: ctx.company_id, conversation_id: ctx.conversation_id,
    pending_action_id: data.id, tool_name, input: validated_input, output: preview, status: "proposed",
  });
  return { pending_action_id: data.id, status: "awaiting_approval", preview };
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ───────────────────────── HTTP entrypoint ─────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE = Deno.env.get("LOVABLE_API_KEY");

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;

  const { data: profile } = await admin.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
  const company_id = profile?.company_id;
  if (!company_id) return json({ error: "No company on profile" }, 400);

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const roleSet = new Set((roles ?? []).map((r: any) => r.role));
  const canMutate = roleSet.has("admin") || roleSet.has("pharmacist") || roleSet.has("super_admin");

  // ─── approve ───
  if (action === "approve") {
    if (!canMutate) return json({ error: "Forbidden: requires admin or pharmacist role" }, 403);
    const pid = body.pending_action_id as string;
    if (!pid) return json({ error: "pending_action_id required" }, 400);
    const t0 = Date.now();
    const { data: row, error: rErr } = await admin.from("agent_pending_actions").select("*").eq("id", pid).maybeSingle();
    if (rErr || !row) return json({ error: "Pending action not found" }, 404);
    if (row.user_id !== user.id) return json({ error: "Forbidden" }, 403);
    if (row.status !== "pending") return json({ error: `Action already ${row.status}` }, 409);
    if (new Date(row.expires_at) < new Date()) {
      await admin.from("agent_pending_actions").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", pid);
      return json({ error: "Action expired" }, 410);
    }
    const result = await commitAction(admin, company_id, user.id, row);
    const finalStatus = result.ok ? "executed" : "failed";
    await admin.from("agent_pending_actions").update({
      status: finalStatus,
      result: result.ok ? result.output : { error: result.error, code: result.code },
      resolved_at: new Date().toISOString(),
    }).eq("id", pid);
    await admin.from("agent_audit_log").insert({
      user_id: user.id, company_id, conversation_id: row.conversation_id,
      pending_action_id: pid, tool_name: row.tool_name,
      input: row.validated_input, output: result.ok ? result.output : null,
      status: finalStatus, error_code: result.ok ? null : (result.code || "UNKNOWN"),
      latency_ms: Date.now() - t0,
    });
    return json({ status: finalStatus, ...(result.ok ? { output: result.output } : { error: result.error }) });
  }

  // ─── reject ───
  if (action === "reject") {
    const pid = body.pending_action_id as string;
    if (!pid) return json({ error: "pending_action_id required" }, 400);
    const { data: row } = await admin.from("agent_pending_actions").select("*").eq("id", pid).maybeSingle();
    if (!row || row.user_id !== user.id) return json({ error: "Not found" }, 404);
    if (row.status !== "pending") return json({ error: `Action already ${row.status}` }, 409);
    await admin.from("agent_pending_actions").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", pid);
    await admin.from("agent_audit_log").insert({
      user_id: user.id, company_id, conversation_id: row.conversation_id,
      pending_action_id: pid, tool_name: row.tool_name,
      input: row.validated_input, status: "rejected",
    });
    return json({ status: "rejected" });
  }

  // ─── chat ───
  if (action !== "chat") return json({ error: "Unknown action" }, 400);
  if (!LOVABLE) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

  let conversation_id = body.conversation_id as string | undefined;
  const userText: string = String(body.message || "").trim();
  if (!userText) return json({ error: "message required" }, 400);

  if (!conversation_id) {
    const { data: conv, error: cErr } = await admin.from("agent_conversations").insert({
      user_id: user.id, company_id, title: userText.slice(0, 60),
    }).select("id").single();
    if (cErr) return json({ error: cErr.message }, 500);
    conversation_id = conv.id as string;
  }

  const { data: history } = await admin.from("agent_messages")
    .select("role, parts").eq("conversation_id", conversation_id)
    .order("created_at", { ascending: true }).limit(40);

  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = `You are the ERP Action Agent for a multi-tenant Indian pharmacy/B2B ERP.
Today is ${today}. Currency is INR. The current user has roles: ${[...roleSet].join(", ") || "none"}.
${canMutate ? "" : "IMPORTANT: This user CANNOT approve mutations. Do not call mutating tools; explain what they would need to do manually."}

You have two kinds of tools:
- READ tools (search_*, get_outstanding, list_recent_sales) — run immediately and return results.
- MUTATING tools (upsert_customer, upsert_supplier, upsert_doctor, create_product, record_payment) — DO NOT write directly. They queue a proposed change that the user MUST Approve in the UI.

STRICT RULES — follow these every turn:
1. NEVER invent IDs, prices, phone numbers, invoice numbers, GSTINs, or amounts. If you don't have it, ASK ONE concise question.
2. BEFORE proposing any create/upsert, call the matching search_* tool to find duplicates. If a likely match exists, ask the user "Did you mean X, or create new?" instead of silently creating.
3. BEFORE record_payment, you MUST call search_invoices (or search_purchase_bills) and use the returned id + invoice_number. Never guess.
4. If a required field for a mutating tool is missing, ask the user ONE focused follow-up question. Do not fill in defaults for required fields (name, amount, etc.).
5. After a mutating tool returns "awaiting_approval", respond with ONE short sentence pointing the user to the approval card. Do not narrate the data — the card shows it.
6. Be terse and businesslike. No emojis, no filler. Indian English. Use ₹ for currency in prose.
7. If the user asks about data you can read (outstanding, recent sales, list of customers), USE a read tool — do not guess from memory.
8. For ambiguous party names returned by search, present the top matches as a numbered list and ask the user to pick.`;

  const llmMessages: any[] = [{ role: "system", content: systemPrompt }];
  for (const m of history ?? []) {
    const parts = (m as any).parts || [];
    if (m.role === "user") {
      llmMessages.push({ role: "user", content: parts.map((p: any) => p.text).filter(Boolean).join("\n") });
    } else if (m.role === "assistant") {
      const last = parts[parts.length - 1];
      if (last?.text) llmMessages.push({ role: "assistant", content: last.text });
    }
  }
  llmMessages.push({ role: "user", content: userText });

  await admin.from("agent_messages").insert({
    conversation_id, role: "user", parts: [{ type: "text", text: userText }],
  });

  const ctx = { conversation_id: conversation_id!, user_id: user.id, company_id };
  let assistantText = "";
  let pending_action_id: string | null = null;
  let pending_preview: any = null;
  let pending_tool: string | null = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    let resp: any;
    try {
      resp = await callGateway(LOVABLE, llmMessages);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes(" 429")) return json({ error: "Rate limited. Try again shortly." }, 429);
      if (msg.includes(" 402")) return json({ error: "AI credits exhausted." }, 402);
      return json({ error: `LLM error: ${msg}` }, 500);
    }
    const choice = resp.choices?.[0];
    const msg = choice?.message;
    if (!msg) break;

    const toolCalls = msg.tool_calls as any[] | undefined;
    if (!toolCalls || toolCalls.length === 0) {
      assistantText = msg.content || "";
      break;
    }

    llmMessages.push({ role: "assistant", content: msg.content || "", tool_calls: toolCalls });

    for (const call of toolCalls) {
      const name = call.function?.name;
      let args: any = {};
      try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }

      let toolResult: any;
      if (MUTATING_TOOLS.has(name)) {
        if (!canMutate) {
          toolResult = { error: "User lacks permission (needs admin or pharmacist role)." };
        } else {
          const v =
            name === "upsert_customer" ? vCustomer(args) :
            name === "upsert_supplier" ? vSupplier(args) :
            name === "upsert_doctor"   ? vDoctor(args) :
            name === "create_product"  ? vProduct(args) :
            name === "record_payment"  ? vPayment(args) :
            err("UNKNOWN", "Unknown tool");
          if (!v.ok) {
            toolResult = { error: v.message, code: v.code };
          } else {
            const preview = await buildPreview(admin, company_id, name, v.data);
            const r = await proposeAction(admin, ctx, name, v.data, preview);
            if (r.pending_action_id) {
              pending_action_id = r.pending_action_id;
              pending_preview = preview;
              pending_tool = name;
            }
            toolResult = r;
          }
        }
      } else if (READ_TOOLS.has(name)) {
        toolResult = await execReadTool(admin, company_id, name, args);
      } else {
        toolResult = { error: `Unknown tool: ${name}` };
      }

      llmMessages.push({
        role: "tool", tool_call_id: call.id, content: JSON.stringify(toolResult),
      });
    }

    if (pending_action_id) {
      try {
        const final = await callGateway(LOVABLE, [
          ...llmMessages,
          { role: "system", content: "Respond with ONE short sentence telling the user to review and approve the card. Do not restate the data." },
        ]);
        assistantText = final.choices?.[0]?.message?.content || "Please review and approve the card above.";
      } catch {
        assistantText = "Please review and approve the card above.";
      }
      break;
    }
  }

  if (!assistantText) assistantText = "I couldn't produce a response. Try rephrasing.";

  const parts: any[] = [{ type: "text", text: assistantText }];
  if (pending_action_id) parts.push({ type: "pending_action", id: pending_action_id, tool: pending_tool, preview: pending_preview });

  await admin.from("agent_messages").insert({
    conversation_id, role: "assistant", parts,
  });

  return json({
    conversation_id,
    reply: assistantText,
    pending_action_id,
    pending_tool,
    pending_preview,
  });
});
