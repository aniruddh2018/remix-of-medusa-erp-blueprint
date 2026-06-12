import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Twilio posts application/x-www-form-urlencoded.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response/>';
  const xmlHeaders = { ...corsHeaders, "Content-Type": "text/xml" };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const text = await req.text();
    const params = new URLSearchParams(text);
    const From = params.get("From") ?? "";
    const To = params.get("To") ?? "";
    const Body = params.get("Body") ?? "";
    const MessageSid = params.get("MessageSid") ?? "";
    const isWa = From.startsWith("whatsapp:") || To.startsWith("whatsapp:");
    const channel = isWa ? "whatsapp" : "sms";

    // Match the destination (To) against any company's configured sender number.
    const toBare = To.replace(/^whatsapp:/, "");
    const { data: matches } = await admin
      .from("twilio_settings")
      .select("company_id, sms_from, whatsapp_from");
    const match = (matches ?? []).find((r) => {
      const sms = (r.sms_from ?? "").replace(/^whatsapp:/, "");
      const wa = (r.whatsapp_from ?? "").replace(/^whatsapp:/, "");
      return sms === toBare || wa === toBare;
    });

    if (match) {
      await admin.from("twilio_messages").insert({
        company_id: match.company_id,
        direction: "inbound",
        channel,
        to_number: To,
        from_number: From,
        body: Body,
        message_sid: MessageSid,
        status: "received",
        metadata: Object.fromEntries(params.entries()),
      });
    } else {
      console.warn("Inbound message: no company matched destination", To);
    }
    return new Response(twiml, { headers: xmlHeaders });
  } catch (e) {
    console.error("twilio-inbound error", e);
    return new Response(twiml, { headers: xmlHeaders });
  }
});
