import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

interface Payload {
  channel: "sms" | "whatsapp";
  to: string;
  body?: string;
  templateKey?: string;
  vars?: Record<string, string | number | null | undefined>;
  relatedInvoiceId?: string | null;
  mediaUrl?: string;
}

function normalize(phone: string, defaultCC = "91"): string | null {
  if (!phone) return null;
  let d = String(phone).replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10) d = defaultCC + d;
  d = d.replace(/^0+/, "");
  if (d.length < 8 || d.length > 15) return null;
  return "+" + d;
}

function render(body: string, vars: Record<string, unknown> = {}) {
  return body.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === null || v === undefined || v === "" ? `{${k}}` : String(v);
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
      return new Response(JSON.stringify({ error: "Twilio connector not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as Payload;
    if (!payload || !payload.channel || !payload.to) {
      return new Response(JSON.stringify({ error: "channel and to are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: uc } = await admin
      .from("user_companies").select("company_id")
      .eq("user_id", userData.user.id).limit(1).maybeSingle();
    const companyId = uc?.company_id;
    if (!companyId) {
      return new Response(JSON.stringify({ error: "No company for user" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await admin
      .from("twilio_settings").select("*").eq("company_id", companyId).maybeSingle();
    if (!settings || settings.enabled === false) {
      return new Response(JSON.stringify({ error: "Twilio not enabled. Configure sender numbers in Settings." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fromRaw = payload.channel === "sms" ? settings.sms_from : settings.whatsapp_from;
    if (!fromRaw) {
      return new Response(JSON.stringify({ error: `No ${payload.channel.toUpperCase()} sender configured` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const DEFAULT_TEMPLATES: Record<string, string> = {
      invoice_sent:
        "Hello {customer},\n\nThank you for your purchase at {company}.\nInvoice: {invoice_no}\nAmount: ₹{amount}\nDate: {date}\n\n📄 Download invoice PDF:\n{pdf_url}\n\nPlease let us know if you need anything else.",
      payment_reminder:
        "Hello {customer},\n\nThis is a gentle reminder from {company} for invoice {invoice_no} dated {date}.\nOutstanding balance: ₹{balance} ({days_overdue} day(s) overdue).\n\nKindly arrange the payment at your earliest convenience. Thank you.",
      purchase_order:
        "Hello {supplier},\n\nPlease find our purchase order from {company}.\nPO No: {po_no}\nDate: {date}\nAmount: ₹{amount}\n\n📄 Download PO PDF:\n{pdf_url}\n\nKindly confirm receipt and expected delivery.",
      order_status:
        "Hello {customer},\n\nYour order {invoice_no} with {company} is *{status}*.\nAmount: ₹{amount}\n\nThanks for shopping with us!",
    };

    let body = payload.body ?? "";
    if (!body && payload.templateKey) {
      const { data: tpl } = await admin
        .from("whatsapp_templates").select("body, enabled")
        .eq("company_id", companyId).eq("template_key", payload.templateKey).maybeSingle();
      if (tpl && tpl.enabled === false) {
        return new Response(JSON.stringify({ error: "Template is disabled" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const tplBody = tpl?.body || DEFAULT_TEMPLATES[payload.templateKey] || "";
      if (tplBody) {
        // Include company name fallback for {company} placeholder.
        const { data: comp } = await admin
          .from("companies").select("name").eq("id", companyId).maybeSingle();
        body = render(tplBody, { company: comp?.name ?? "", ...(payload.vars ?? {}) });
      }
    }
    if (!body) {
      return new Response(JSON.stringify({ error: "Message body is empty" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toNorm = normalize(payload.to);
    if (!toNorm) {
      return new Response(JSON.stringify({ error: "Invalid recipient phone number" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const toFinal = payload.channel === "whatsapp" ? `whatsapp:${toNorm}` : toNorm;
    const fromFinal = payload.channel === "whatsapp"
      ? (fromRaw.startsWith("whatsapp:") ? fromRaw : `whatsapp:${fromRaw}`)
      : fromRaw;

    const form = new URLSearchParams({ To: toFinal, From: fromFinal, Body: body });
    if (payload.mediaUrl) form.append("MediaUrl", payload.mediaUrl);

    const twResp = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    const twData = await twResp.json().catch(() => ({}));

    await admin.from("twilio_messages").insert({
      company_id: companyId,
      direction: "outbound",
      channel: payload.channel,
      to_number: toFinal,
      from_number: fromFinal,
      body,
      template_key: payload.templateKey ?? null,
      message_sid: twData?.sid ?? null,
      status: twData?.status ?? (twResp.ok ? "queued" : "failed"),
      error_code: twData?.code ? String(twData.code) : null,
      error_message: twData?.message ?? null,
      related_invoice_id: payload.relatedInvoiceId ?? null,
      metadata: { http_status: twResp.status },
    });

    if (!twResp.ok) {
      return new Response(JSON.stringify({ error: twData?.message || "Twilio request failed", details: twData }), {
        status: twResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ sid: twData.sid, status: twData.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
