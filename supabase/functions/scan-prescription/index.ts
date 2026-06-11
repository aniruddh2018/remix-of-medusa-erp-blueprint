// Prescription image -> structured medicines via Lovable AI (Gemini vision)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  prescription_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Unauthorized");

    const { prescription_id } = (await req.json()) as Body;
    if (!prescription_id) throw new Error("prescription_id required");

    // Load prescription
    const { data: rx, error: rxErr } = await supabase
      .from("prescriptions")
      .select("id, company_id, image_url")
      .eq("id", prescription_id)
      .single();
    if (rxErr || !rx) throw new Error("Prescription not found");
    if (!rx.image_url) throw new Error("Prescription has no image");

    // Sign URL for the model to fetch (bucket is private)
    const path = rx.image_url.replace(/^.*\/prescriptions\//, "");
    const { data: signed, error: signErr } = await supabase
      .storage.from("prescriptions").createSignedUrl(path, 600);
    if (signErr || !signed?.signedUrl) throw new Error("Could not sign image URL");

    const systemPrompt = `You are a pharmacist's AI assistant. Read the prescription image and extract every prescribed medicine. 
Return STRUCTURED data only via the provided tool. Ignore doctor letterhead, patient name, and signatures.
For handwriting, take a best guess but lower the confidence.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract every medicine from this prescription." },
              { type: "image_url", image_url: { url: signed.signedUrl } },
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_prescription",
            description: "Extract medicines from a prescription image",
            parameters: {
              type: "object",
              properties: {
                doctor_name: { type: "string", nullable: true },
                patient_name: { type: "string", nullable: true },
                notes: { type: "string", nullable: true },
                medicines: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Medicine brand/generic name" },
                      strength: { type: "string", nullable: true, description: "e.g. 500mg, 10ml" },
                      dosage: { type: "string", nullable: true, description: "e.g. 1-0-1" },
                      duration: { type: "string", nullable: true, description: "e.g. 5 days" },
                      qty: { type: "number", description: "Pack qty to dispense; estimate if not stated" },
                      confidence: { type: "number", description: "0-100" },
                    },
                    required: ["name", "qty", "confidence"],
                  },
                },
              },
              required: ["medicines"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_prescription" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limit", message: "AI rate limit reached" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "credits_exhausted", message: "AI credits exhausted" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      throw new Error(`AI gateway error: ${aiResp.status} ${t}`);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return structured data");
    const parsed = JSON.parse(toolCall.function.arguments);
    const medicines: Array<{
      name: string; strength?: string; dosage?: string; duration?: string;
      qty: number; confidence: number;
    }> = parsed.medicines || [];

    // Try to auto-match each medicine to a product in the company
    const { data: products } = await supabase
      .from("products")
      .select("id, name, generic_name")
      .eq("company_id", rx.company_id)
      .limit(5000);

    const matched = medicines.map((m) => {
      const needle = m.name.toLowerCase();
      const hit = (products || []).find((p) =>
        p.name?.toLowerCase().includes(needle) ||
        needle.includes((p.name || "").toLowerCase()) ||
        p.generic_name?.toLowerCase().includes(needle),
      );
      return { ...m, product_id: hit?.id || null };
    });

    // Clear existing items and insert fresh
    await supabase.from("prescription_items").delete().eq("prescription_id", prescription_id);
    if (matched.length) {
      const rows = matched.map((m) => ({
        prescription_id,
        company_id: rx.company_id,
        product_id: m.product_id,
        ai_name: m.name,
        ai_strength: m.strength || null,
        ai_dosage: m.dosage || null,
        ai_duration: m.duration || null,
        qty: m.qty || 1,
        confidence: m.confidence ?? null,
        approved: false,
      }));
      const { error: insErr } = await supabase.from("prescription_items").insert(rows);
      if (insErr) throw insErr;
    }

    const avgConf = medicines.length
      ? medicines.reduce((s, m) => s + (m.confidence || 0), 0) / medicines.length
      : null;

    await supabase.from("prescriptions").update({
      ai_raw: parsed,
      ai_confidence: avgConf,
      ocr_text: medicines.map((m) =>
        `${m.name}${m.strength ? " " + m.strength : ""} x${m.qty}`).join("\n"),
      status: "pending_review",
    }).eq("id", prescription_id);

    return new Response(JSON.stringify({ ok: true, count: medicines.length, items: matched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan-prescription error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
