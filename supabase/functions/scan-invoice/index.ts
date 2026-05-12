import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return "image/jpeg";
}

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

    const { file_paths, company_id } = await req.json();
    if (!file_paths || !Array.isArray(file_paths) || file_paths.length === 0 || !company_id) {
      throw new Error("file_paths (array) and company_id are required");
    }

    // Verify the authenticated user belongs to the supplied company
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw new Error("Failed to verify company membership");

    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    const callerCompany = profile?.company_id;
    if (!isSuperAdmin && callerCompany !== company_id) {
      return new Response(
        JSON.stringify({ error: "Forbidden: company mismatch" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate that every file path is scoped to caller's company folder
    for (const fp of file_paths) {
      if (typeof fp !== "string" || !fp.startsWith(`${company_id}/`)) {
        return new Response(
          JSON.stringify({ error: `Forbidden: file path outside company scope: ${fp}` }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Generate signed URLs (avoid loading files into memory to prevent WORKER_RESOURCE_LIMIT)
    const imageContents: { type: string; image_url: { url: string } }[] = [];
    for (const filePath of file_paths) {
      const { data: signed, error: signErr } = await supabase.storage
        .from("invoices")
        .createSignedUrl(filePath, 600);
      if (signErr || !signed?.signedUrl) throw new Error(`Failed to sign: ${filePath}`);

      imageContents.push({
        type: "image_url",
        image_url: { url: signed.signedUrl },
      });
    }

    // Fetch existing suppliers and products for matching
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("company_id", company_id);

    const { data: products } = await supabase
      .from("products")
      .select("id, name, gst_percentage, hsn_code, mrp, purchase_price")
      .eq("company_id", company_id);

    const supplierNames = (suppliers || []).map((s: any) => s.name).join(", ");
    const productNames = (products || []).map((p: any) => `${p.name} (MRP: ${p.mrp})`).join(", ");

    const systemPrompt = `You are a purchase invoice data extraction AI for a pharmacy/electronics ERP system. 
Extract ALL data from the invoice image(s) accurately. If multiple images are provided, they are pages of the SAME invoice — combine all line items.

EXISTING SUPPLIERS in the system: ${supplierNames || "None"}
EXISTING PRODUCTS in the system: ${productNames || "None"}

Return a JSON object using the tool provided. Match supplier and product names to existing ones when possible (fuzzy match).
For dates, use YYYY-MM-DD format.
For amounts, use numbers without currency symbols.
If a field is not found in the invoice, use null.
Extract EVERY line item visible across all images.`;

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
            content: [
              {
                type: "text",
                text: "Extract all purchase invoice data from these document image(s). They may be multiple pages of the same invoice. Include supplier details, invoice number, date, all line items with product name, batch number, expiry date, manufacturing date, quantity, purchase price (rate), MRP, GST percentage, discount, and total. Also extract any freight/handling/other charges and overall totals.",
              },
              ...imageContents,
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_invoice_data",
              description: "Extract structured purchase invoice data",
              parameters: {
                type: "object",
                properties: {
                  supplier_name: { type: "string", description: "Supplier/vendor name" },
                  supplier_gst: { type: "string", nullable: true, description: "Supplier GST number" },
                  supplier_dl_number: { type: "string", nullable: true, description: "Drug license number" },
                  supplier_address: { type: "string", nullable: true, description: "Supplier address" },
                  supplier_phone: { type: "string", nullable: true, description: "Supplier phone/contact number" },
                  supplier_email: { type: "string", nullable: true, description: "Supplier email" },
                  invoice_number: { type: "string", description: "Invoice/bill number" },
                  invoice_date: { type: "string", description: "Invoice date YYYY-MM-DD" },
                  challan_number: { type: "string", nullable: true },
                  line_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        product_name: { type: "string" },
                        batch_number: { type: "string", nullable: true },
                        expiry_date: { type: "string", nullable: true, description: "YYYY-MM-DD" },
                        manufacturing_date: { type: "string", nullable: true, description: "YYYY-MM-DD" },
                        quantity: { type: "number" },
                        free_quantity: { type: "number", nullable: true },
                        purchase_price: { type: "number", description: "Rate/unit price" },
                        mrp: { type: "number" },
                        gst_percentage: { type: "number" },
                        discount_percentage: { type: "number", nullable: true },
                        hsn_code: { type: "string", nullable: true },
                        total_price: { type: "number" },
                      },
                      required: ["product_name", "quantity", "purchase_price", "mrp", "gst_percentage", "total_price"],
                    },
                  },
                  freight_charges: { type: "number", nullable: true },
                  handling_charges: { type: "number", nullable: true },
                  other_charges: { type: "number", nullable: true },
                  discount_amount: { type: "number", nullable: true },
                  gst_amount: { type: "number", nullable: true },
                  total_amount: { type: "number" },
                },
                required: ["supplier_name", "invoice_number", "invoice_date", "line_items", "total_amount"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_invoice_data" } },
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
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return structured data");

    const extractedData = JSON.parse(toolCall.function.arguments);

    // Match supplier to existing
    let matchedSupplierId: string | null = null;
    if (suppliers && extractedData.supplier_name) {
      const match = suppliers.find(
        (s: any) => s.name.toLowerCase().trim() === extractedData.supplier_name.toLowerCase().trim()
      );
      if (match) matchedSupplierId = match.id;
    }

    // Match products to existing
    if (products && extractedData.line_items) {
      for (const item of extractedData.line_items) {
        const match = products.find(
          (p: any) => p.name.toLowerCase().trim() === item.product_name.toLowerCase().trim()
        );
        if (match) {
          item.matched_product_id = match.id;
          item.matched_product_name = match.name;
        }
      }
    }

    return new Response(
      JSON.stringify({
        ...extractedData,
        matched_supplier_id: matchedSupplierId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("scan-invoice error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
