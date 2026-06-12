import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BulkPayload {
  channel: "sms" | "whatsapp";
  templateKey: string;
  recipients: { to: string; vars?: Record<string, string | number | null | undefined>; relatedInvoiceId?: string | null }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const payload = (await req.json()) as BulkPayload;
    if (!payload?.channel || !payload?.templateKey || !Array.isArray(payload.recipients)) {
      return new Response(JSON.stringify({ error: "channel, templateKey, recipients required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { to: string; ok: boolean; sid?: string; error?: string }[] = [];
    for (const r of payload.recipients) {
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/twilio-send`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: payload.channel,
            templateKey: payload.templateKey,
            to: r.to,
            vars: r.vars,
            relatedInvoiceId: r.relatedInvoiceId ?? null,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        results.push(resp.ok
          ? { to: r.to, ok: true, sid: data.sid }
          : { to: r.to, ok: false, error: data?.error || `HTTP ${resp.status}` });
      } catch (err) {
        results.push({ to: r.to, ok: false, error: err instanceof Error ? err.message : "send failed" });
      }
      // Small spacing to be gentle on Twilio rate limits.
      await new Promise((res) => setTimeout(res, 150));
    }

    const sent = results.filter((r) => r.ok).length;
    return new Response(JSON.stringify({ sent, total: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
