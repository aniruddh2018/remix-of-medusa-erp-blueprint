import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    const { text, company_id, type } = await req.json();
    if (!text || !company_id) {
      throw new Error("text and company_id are required");
    }

    // Verify the authenticated user belongs to the supplied company
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw new Error("Failed to verify company membership");

    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    if (!isSuperAdmin && profile?.company_id !== company_id) {
      return new Response(
        JSON.stringify({ error: "Forbidden: company mismatch" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch existing products for fuzzy matching
    const { data: products } = await supabase
      .from("products")
      .select("id, name, generic_name, strength, manufacturer, mrp, purchase_price, sale_price, gst_percentage, hsn_code")
      .eq("company_id", company_id)
      .eq("is_active", true);

    const productList = (products || []).map((p: any) =>
      `ID:${p.id} | Name:${p.name} | Generic:${p.generic_name || ""} | Strength:${p.strength || ""} | Mfr:${p.manufacturer} | MRP:${p.mrp} | PurchasePrice:${p.purchase_price} | SalePrice:${p.sale_price || p.mrp} | GST:${p.gst_percentage}% | HSN:${p.hsn_code || ""}`
    ).join("\n");

    const isSale = type === "sale";

    const systemPrompt = `You are a pharmacy/store order parser. Parse the user's natural language text into structured line items.

EXISTING PRODUCTS in the system:
${productList || "None"}

RULES:
1. Match product names using FUZZY/BROKEN word matching. Users often write partial names, abbreviations, or misspelled names. Match to the BEST possible product from the list.
2. If a quantity is mentioned, use it. If not, default to 1.
3. If a rate/price is mentioned (e.g. "at 50", "@50", "rate 50"), use that. Otherwise use null to indicate default pricing.
4. If free quantity is mentioned (e.g. "10+1", "12+2 free"), extract both main qty and free qty.
5. Extract ALL items from the text, even if names are abbreviated or broken.
6. Return the matched product ID if you find a match. If no match, return null for product_id and put the original text in product_name_raw.

Examples of broken words: "para" = "Paracetamol", "amox" = "Amoxicillin", "crocin" = "Crocin Advance", "dolo" = "Dolo 650"`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `Parse this ${isSale ? "sales" : "purchase"} order text into structured items:\n\n${text}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_order_items",
              description: "Parse natural language order text into structured line items",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        product_id: { type: "string", nullable: true, description: "Matched product ID from existing products, or null if no match" },
                        product_name_matched: { type: "string", description: "The matched product name from existing products" },
                        product_name_raw: { type: "string", description: "The original text the user wrote for this product" },
                        quantity: { type: "number", description: "Main quantity" },
                        free_quantity: { type: "number", nullable: true, description: "Free scheme quantity (e.g. 1 in 10+1)" },
                        rate: { type: "number", nullable: true, description: "Custom rate if specified, null for default" },
                        confidence: { type: "number", description: "Match confidence 0-1" },
                      },
                      required: ["product_name_matched", "product_name_raw", "quantity", "confidence"],
                    },
                  },
                  customer_name: { type: "string", nullable: true, description: "Customer name if mentioned" },
                },
                required: ["items"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "parse_order_items" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI parsing failed: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return structured data");

    const parsed = JSON.parse(toolCall.function.arguments);

    // Enrich matched items with full product data
    if (products && parsed.items) {
      for (const item of parsed.items) {
        if (item.product_id) {
          const product = products.find((p: any) => p.id === item.product_id);
          if (product) {
            item.product_name_matched = product.name + (product.strength ? ` ${product.strength}` : "");
            item.mrp = product.mrp;
            item.purchase_price = product.purchase_price;
            item.sale_price = product.sale_price || product.mrp;
            item.gst_percentage = product.gst_percentage;
            item.hsn_code = product.hsn_code;
          }
        }
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-order-text error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
