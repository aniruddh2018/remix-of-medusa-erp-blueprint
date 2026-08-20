// GST e-Invoicing (IRN via NIC direct API) + e-Way Bill edge function.
//
// Actions (POST body: { action, ...params }):
//   get_status          { companyId }                         -> credential status (no secrets returned)
//   save_credentials    { companyId, ... }                     -> admin-only, upserts NIC credentials
//   generate_irn        { salesOrderId, seller?, buyer? }      -> generates IRN + QR for a B2B sales invoice
//   cancel_irn          { salesOrderId, reason, remarks }      -> cancels an IRN (must be within 24h per GST rules)
//   generate_ewaybill   { salesOrderId, transport details }    -> generates an e-Way Bill against an existing IRN
//   cancel_ewaybill     { salesOrderId, reason, remarks }      -> cancels an e-Way Bill
//
// When no NIC credentials are configured for the company, generate_irn /
// generate_ewaybill run in MOCK mode: they synthesize a clearly-labelled
// fake IRN/QR (prefixed "MOCK") so the rest of the app (printing, status
// tracking, cancellation) is fully exercisable without real GSP/NIC
// credentials. Real calls activate automatically once an admin saves
// working credentials in Settings.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { authenticate, callAuthenticated, type NicCredentials } from "./nicClient.ts";
import { buildEInvoicePayload, buildMockIrnResponse, type EInvoiceInput } from "./schema.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const CANCEL_REASONS: Record<string, string> = {
  duplicate: "1",
  data_entry_mistake: "2",
  order_cancelled: "3",
  other: "4",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const action = body?.action as string;

    const isMember = async (companyId: string): Promise<boolean> => {
      const { data } = await admin.from("user_companies").select("company_id").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
      if (data) return true;
      const { data: superAdmin } = await admin.rpc("is_super_admin", { _user_id: userId });
      return !!superAdmin;
    };

    const isAdmin = async (): Promise<boolean> => {
      const { data } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (data) return true;
      const { data: superAdmin } = await admin.rpc("is_super_admin", { _user_id: userId });
      return !!superAdmin;
    };

    // ── Credential status (no secrets returned) ──────────────────────────
    if (action === "get_status") {
      const companyId = body.companyId as string;
      if (!companyId || !(await isMember(companyId))) return json({ error: "Forbidden" }, 403);
      const { data: creds } = await admin
        .from("gst_einvoice_credentials")
        .select("env, gstin, username, client_id, public_key_pem, api_base_url, is_active")
        .eq("company_id", companyId)
        .maybeSingle();
      const configured = !!(creds?.gstin && creds?.username && creds?.client_id && creds?.public_key_pem);
      return json({
        configured,
        mock_mode: !configured,
        env: creds?.env ?? "sandbox",
        gstin: creds?.gstin ?? null,
        api_base_url: creds?.api_base_url ?? null,
        is_active: creds?.is_active ?? true,
      });
    }

    // ── Save NIC credentials (admin only) ─────────────────────────────────
    if (action === "save_credentials") {
      const companyId = body.companyId as string;
      if (!companyId || !(await isMember(companyId))) return json({ error: "Forbidden" }, 403);
      if (!(await isAdmin())) return json({ error: "Only admins can configure GST e-Invoice credentials" }, 403);

      const row: Record<string, unknown> = {
        company_id: companyId,
        env: body.env ?? "sandbox",
        gstin: body.gstin ?? null,
        username: body.username ?? null,
        client_id: body.client_id ?? null,
        is_active: body.is_active ?? true,
      };
      // Only overwrite secret fields if the client actually sent a new value
      // (the frontend never re-displays saved secrets, so an empty field on
      // save means "leave unchanged").
      if (body.password) row.password = body.password;
      if (body.client_secret) row.client_secret = body.client_secret;
      if (body.public_key_pem) row.public_key_pem = body.public_key_pem;
      for (const pathField of ["api_base_url", "auth_path", "generate_irn_path", "cancel_irn_path", "generate_ewb_path", "cancel_ewb_path"]) {
        if (body[pathField]) row[pathField] = body[pathField];
      }
      // Credentials changed -> invalidate any cached session.
      row.auth_token = null;
      row.sek = null;
      row.token_expiry = null;

      const { error } = await admin.from("gst_einvoice_credentials").upsert(row, { onConflict: "company_id" });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ── Everything below operates on a specific sales_order ──────────────
    const salesOrderId = body.salesOrderId as string | undefined;
    if (!salesOrderId) return json({ error: "salesOrderId is required" }, 400);

    const { data: order, error: orderErr } = await admin
      .from("sales_orders")
      .select(`
        id, company_id, invoice_number, sale_date, customer_name, customer_gstin, customer_address, customer_id,
        is_interstate, place_of_supply, total_amount, discount_amount, freight_charges, handling_charges,
        delivery_charges, other_charges, einvoice_status, einvoice_irn, einvoice_generated_at,
        eway_status, eway_bill_no,
        sales_order_items ( quantity, free_quantity, unit_price, gst_percentage, discount_percentage, sold_unit,
          products ( name, hsn_code, unit ) )
      `)
      .eq("id", salesOrderId)
      .maybeSingle();
    if (orderErr || !order) return json({ error: "Sales invoice not found" }, 404);
    if (!order.company_id || !(await isMember(order.company_id))) return json({ error: "Forbidden" }, 403);

    const { data: company } = await admin
      .from("companies")
      .select("legal_name, name, gst_number, state_code, address, pincode, phone, email")
      .eq("id", order.company_id)
      .maybeSingle();
    if (!company?.gst_number || !company?.state_code) {
      return json({ error: "Company GSTIN/state not configured. Set it up under Settings → GST Filing Setup first." }, 400);
    }

    let customerPincode: string | null = null;
    if (order.customer_id) {
      const { data: cust } = await admin.from("customers").select("pincode").eq("id", order.customer_id).maybeSingle();
      customerPincode = cust?.pincode ?? null;
    }

    const loadCreds = async (): Promise<NicCredentials | null> => {
      const { data } = await admin.from("gst_einvoice_credentials").select("*").eq("company_id", order!.company_id!).maybeSingle();
      if (!data || !data.gstin || !data.username || !data.client_id || !data.public_key_pem || !data.is_active) return null;
      return data as unknown as NicCredentials;
    };

    const persistSession = async (session: { authToken: string; sek: Uint8Array; tokenExpiry: string }) => {
      const b64Sek = btoa(String.fromCharCode(...session.sek));
      await admin.from("gst_einvoice_credentials").update({
        auth_token: session.authToken, sek: b64Sek, token_expiry: session.tokenExpiry,
      }).eq("company_id", order!.company_id!);
    };

    const logCall = async (action_: string, request_payload: unknown, response_payload: unknown, success: boolean, error_message: string | null, is_mock: boolean) => {
      await admin.from("gst_einvoice_log").insert({
        company_id: order!.company_id, sales_order_id: order!.id, action: action_,
        request_payload, response_payload, success, error_message, is_mock, created_by: userId,
      });
    };

    // ── Generate IRN ───────────────────────────────────────────────────────
    if (action === "generate_irn") {
      if (order.einvoice_status === "generated") return json({ error: "e-Invoice already generated for this invoice" }, 400);
      if (!order.customer_gstin) return json({ error: "e-Invoice requires a customer GSTIN (B2B only). This looks like a B2C sale." }, 400);

      const sellerPin = body.sellerPincode || company.pincode;
      const buyerPin = body.buyerPincode || customerPincode;
      if (!sellerPin) return json({ error: "Company pincode is required for e-Invoice. Add it under Settings → GST Filing Setup." }, 400);
      if (!buyerPin) return json({ error: "Customer pincode is required for e-Invoice." }, 400);

      const items = ((order.sales_order_items as unknown[]) || []).map((it) => {
        const row = it as { quantity: number; free_quantity: number; unit_price: number; gst_percentage: number; discount_percentage: number; sold_unit: string | null; products: { name: string; hsn_code: string | null; unit: string } | null };
        const discountAmt = row.quantity * row.unit_price * ((row.discount_percentage || 0) / 100);
        return {
          hsnCode: row.products?.hsn_code || "3004",
          description: row.products?.name || "Item",
          quantity: row.quantity,
          freeQuantity: row.free_quantity || 0,
          unit: row.sold_unit || row.products?.unit || "NOS",
          unitPrice: row.unit_price,
          discount: discountAmt,
          gstRate: row.gst_percentage || 0,
          isService: false,
        };
      });
      if (items.length === 0) return json({ error: "Invoice has no line items" }, 400);

      const input: EInvoiceInput = {
        docNumber: order.invoice_number,
        docDate: order.sale_date,
        isInterstate: !!order.is_interstate,
        posStateCode: order.place_of_supply || order.customer_gstin.slice(0, 2),
        seller: {
          gstin: company.gst_number, legalName: company.legal_name || company.name,
          address1: (body.sellerAddress1 || company.address || "NA").slice(0, 100),
          location: body.sellerLocation || company.address?.split(",")[0] || "NA",
          pincode: String(sellerPin), stateCode: company.state_code,
          phone: company.phone || undefined, email: company.email || undefined,
        },
        buyer: {
          gstin: order.customer_gstin, legalName: order.customer_name,
          address1: (body.buyerAddress1 || order.customer_address || "NA").slice(0, 100),
          location: body.buyerLocation || order.customer_address?.split(",")[0] || "NA",
          pincode: String(buyerPin), stateCode: order.place_of_supply || order.customer_gstin.slice(0, 2),
        },
        items,
        discountAmount: Number(order.discount_amount) || 0,
        otherCharges: (Number(order.freight_charges) || 0) + (Number(order.handling_charges) || 0) + (Number(order.delivery_charges) || 0) + (Number(order.other_charges) || 0),
        roundOff: 0,
      };
      const payload = buildEInvoicePayload(input);

      const creds = await loadCreds();
      if (!creds) {
        const mock = buildMockIrnResponse(order.invoice_number, company.gst_number);
        await admin.from("sales_orders").update({
          einvoice_status: "generated", einvoice_irn: mock.Irn, einvoice_ack_no: mock.AckNo,
          einvoice_ack_date: mock.AckDt, einvoice_signed_invoice: mock.SignedInvoice,
          einvoice_signed_qr_code: mock.SignedQRCode, einvoice_error: null,
          einvoice_generated_at: new Date().toISOString(), einvoice_is_mock: true,
        }).eq("id", order.id);
        await logCall("generate_irn", payload, mock, true, null, true);
        return json({ ok: true, mock: true, ...mock });
      }

      try {
        const session = await authenticate(creds);
        await persistSession(session);
        const result = await callAuthenticated<typeof payload, { Irn: string; AckNo: string; AckDt: string; SignedInvoice: string; SignedQRCode: string; EwbNo?: string; EwbDt?: string; EwbValidTill?: string }>(
          creds, session, creds.generate_irn_path, payload,
        );
        if (!result.ok) {
          await admin.from("sales_orders").update({ einvoice_status: "failed", einvoice_error: result.error }).eq("id", order.id);
          await logCall("generate_irn", payload, result.raw, false, result.error, false);
          return json({ error: result.error }, 502);
        }
        const d = result.data;
        await admin.from("sales_orders").update({
          einvoice_status: "generated", einvoice_irn: d.Irn, einvoice_ack_no: d.AckNo,
          einvoice_ack_date: d.AckDt, einvoice_signed_invoice: d.SignedInvoice,
          einvoice_signed_qr_code: d.SignedQRCode, einvoice_error: null,
          einvoice_generated_at: new Date().toISOString(), einvoice_is_mock: false,
          ...(d.EwbNo ? { eway_status: "generated", eway_bill_no: d.EwbNo, eway_bill_date: d.EwbDt, eway_valid_till: d.EwbValidTill } : {}),
        }).eq("id", order.id);
        await logCall("generate_irn", payload, result.raw, true, null, false);
        return json({ ok: true, mock: false, ...d });
      } catch (e) {
        const message = (e as Error).message;
        await admin.from("sales_orders").update({ einvoice_status: "failed", einvoice_error: message }).eq("id", order.id);
        await logCall("generate_irn", payload, null, false, message, false);
        return json({ error: message }, 502);
      }
    }

    // ── Cancel IRN ─────────────────────────────────────────────────────────
    if (action === "cancel_irn") {
      if (order.einvoice_status !== "generated" || !order.einvoice_irn) return json({ error: "No active IRN to cancel" }, 400);
      if (order.einvoice_generated_at) {
        const ageHours = (Date.now() - new Date(order.einvoice_generated_at).getTime()) / 3.6e6;
        if (ageHours > 24) return json({ error: "IRN can only be cancelled within 24 hours of generation, per GST rules." }, 400);
      }
      const reasonCode = CANCEL_REASONS[body.reason as string] || "3";
      const cancelPayload = { Irn: order.einvoice_irn, CnlRsn: reasonCode, CnlRem: (body.remarks || "Cancelled from ERP").slice(0, 100) };

      const creds = await loadCreds();
      if (!creds) {
        await admin.from("sales_orders").update({
          einvoice_status: "cancelled", einvoice_cancelled_at: new Date().toISOString(), einvoice_cancel_reason: body.remarks || body.reason || null,
        }).eq("id", order.id);
        await logCall("cancel_irn", cancelPayload, { mock: true }, true, null, true);
        return json({ ok: true, mock: true });
      }
      try {
        const session = await authenticate(creds);
        await persistSession(session);
        const result = await callAuthenticated(creds, session, creds.cancel_irn_path, cancelPayload);
        if (!result.ok) {
          await logCall("cancel_irn", cancelPayload, result.raw, false, result.error, false);
          return json({ error: result.error }, 502);
        }
        await admin.from("sales_orders").update({
          einvoice_status: "cancelled", einvoice_cancelled_at: new Date().toISOString(), einvoice_cancel_reason: body.remarks || body.reason || null,
        }).eq("id", order.id);
        await logCall("cancel_irn", cancelPayload, result.raw, true, null, false);
        return json({ ok: true, mock: false });
      } catch (e) {
        const message = (e as Error).message;
        await logCall("cancel_irn", cancelPayload, null, false, message, false);
        return json({ error: message }, 502);
      }
    }

    // ── Generate e-Way Bill (linked to an existing IRN) ──────────────────
    if (action === "generate_ewaybill") {
      if (order.einvoice_status !== "generated" || !order.einvoice_irn) return json({ error: "Generate the e-Invoice (IRN) before the e-Way Bill" }, 400);
      if (order.eway_status === "generated") return json({ error: "e-Way Bill already generated for this invoice" }, 400);
      if (!body.vehicleNumber && !body.transporterId) return json({ error: "Provide a vehicle number or transporter ID" }, 400);

      const ewbPayload = {
        Irn: order.einvoice_irn,
        ...(body.transporterId ? { TransId: body.transporterId } : {}),
        ...(body.transporterName ? { TransName: body.transporterName } : {}),
        ...(body.distanceKm ? { Distance: Math.round(Number(body.distanceKm)) } : {}),
        ...(body.vehicleNumber ? { VehNo: String(body.vehicleNumber).toUpperCase() } : {}),
        VehType: "R",
        TransMode: body.transportMode || "1",
      };

      const creds = await loadCreds();
      if (!creds) {
        const now = new Date();
        const validTill = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
        const ewbNo = `MOCKEWB${Math.floor(Math.random() * 1e10)}`;
        await admin.from("sales_orders").update({
          eway_status: "generated", eway_bill_no: ewbNo, eway_bill_date: now.toISOString(), eway_valid_till: validTill,
          eway_is_mock: true, eway_error: null,
          transporter_id: body.transporterId || null, transporter_name: body.transporterName || null,
          transport_mode: body.transportMode || null, vehicle_number: body.vehicleNumber || null, distance_km: body.distanceKm || null,
        }).eq("id", order.id);
        await logCall("generate_ewaybill", ewbPayload, { EwbNo: ewbNo, mock: true }, true, null, true);
        return json({ ok: true, mock: true, EwbNo: ewbNo, EwbValidTill: validTill });
      }
      try {
        const session = await authenticate(creds);
        await persistSession(session);
        const result = await callAuthenticated<typeof ewbPayload, { EwbNo: string; EwbDt: string; EwbValidTill: string }>(
          creds, session, creds.generate_ewb_path, ewbPayload,
        );
        if (!result.ok) {
          await admin.from("sales_orders").update({ eway_status: "failed", eway_error: result.error }).eq("id", order.id);
          await logCall("generate_ewaybill", ewbPayload, result.raw, false, result.error, false);
          return json({ error: result.error }, 502);
        }
        const d = result.data;
        await admin.from("sales_orders").update({
          eway_status: "generated", eway_bill_no: d.EwbNo, eway_bill_date: d.EwbDt, eway_valid_till: d.EwbValidTill,
          eway_is_mock: false, eway_error: null,
          transporter_id: body.transporterId || null, transporter_name: body.transporterName || null,
          transport_mode: body.transportMode || null, vehicle_number: body.vehicleNumber || null, distance_km: body.distanceKm || null,
        }).eq("id", order.id);
        await logCall("generate_ewaybill", ewbPayload, result.raw, true, null, false);
        return json({ ok: true, mock: false, ...d });
      } catch (e) {
        const message = (e as Error).message;
        await admin.from("sales_orders").update({ eway_status: "failed", eway_error: message }).eq("id", order.id);
        await logCall("generate_ewaybill", ewbPayload, null, false, message, false);
        return json({ error: message }, 502);
      }
    }

    // ── Cancel e-Way Bill ──────────────────────────────────────────────────
    if (action === "cancel_ewaybill") {
      if (order.eway_status !== "generated" || !order.eway_bill_no) return json({ error: "No active e-Way Bill to cancel" }, 400);
      const cancelPayload = { EwbNo: order.eway_bill_no, CancelRsnCode: CANCEL_REASONS[body.reason as string] || "3", CancelRmrk: (body.remarks || "Cancelled from ERP").slice(0, 100) };

      const creds = await loadCreds();
      if (!creds) {
        await admin.from("sales_orders").update({ eway_status: "cancelled", eway_cancelled_at: new Date().toISOString() }).eq("id", order.id);
        await logCall("cancel_ewaybill", cancelPayload, { mock: true }, true, null, true);
        return json({ ok: true, mock: true });
      }
      try {
        const session = await authenticate(creds);
        await persistSession(session);
        const result = await callAuthenticated(creds, session, creds.cancel_ewb_path, cancelPayload);
        if (!result.ok) {
          await logCall("cancel_ewaybill", cancelPayload, result.raw, false, result.error, false);
          return json({ error: result.error }, 502);
        }
        await admin.from("sales_orders").update({ eway_status: "cancelled", eway_cancelled_at: new Date().toISOString() }).eq("id", order.id);
        await logCall("cancel_ewaybill", cancelPayload, result.raw, true, null, false);
        return json({ ok: true, mock: false });
      } catch (e) {
        const message = (e as Error).message;
        await logCall("cancel_ewaybill", cancelPayload, null, false, message, false);
        return json({ error: message }, 502);
      }
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("gst-einvoice error", e);
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});
