import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMBEDDING_MODEL = "google/gemini-embedding-001";
const BATCH_SIZE = 20;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing required Supabase environment variables");
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    const serviceClient = createClient(supabaseUrl, supabaseKey);

    const { company_id, product_ids } = await req.json();

    // Resolve which products to embed
    let query = serviceClient
      .from("products")
      .select("id, name, company_id")
      .eq("is_active", true)
      .order("name");

    if (product_ids && Array.isArray(product_ids) && product_ids.length > 0) {
      query = query.in("id", product_ids);
    } else if (company_id) {
      query = query.eq("company_id", company_id).eq("embedding_needs_update", true);
    } else {
      throw new Error("Either product_ids or company_id is required");
    }

    const { data: products, error: fetchError } = await query;
    if (fetchError) throw new Error(`Failed to fetch products: ${fetchError.message}`);
    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ embedded: 0, message: "No products to embed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate embeddings in batches
    let embeddedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      const names = batch.map((p: any) => p.name);

      try {
        const embedRes = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: names,
          }),
        });

        if (!embedRes.ok) {
          const errText = await embedRes.text();
          throw new Error(`Embedding API error ${embedRes.status}: ${errText}`);
        }

        const embedJson = await embedRes.json();
        const embeddings = embedJson.data?.map((d: any) => d.embedding) || [];

        // Upsert each embedding into product_embeddings
        for (let j = 0; j < batch.length; j++) {
          const product = batch[j];
          const embedding = embeddings[j];

          if (!embedding) {
            errors.push(`No embedding returned for product ${product.id}: ${product.name}`);
            continue;
          }

          const { error: upsertError } = await serviceClient
            .from("product_embeddings")
            .upsert({
              product_id: product.id,
              company_id: product.company_id,
              embedding: JSON.stringify(embedding),
              model: EMBEDDING_MODEL,
              generated_at: new Date().toISOString(),
            }, { onConflict: "product_id" });

          if (upsertError) {
            errors.push(`Failed to store embedding for ${product.name}: ${upsertError.message}`);
            continue;
          }

          // Clear the needs-update flag
          await serviceClient
            .from("products")
            .update({ embedding_needs_update: false })
            .eq("id", product.id);

          embeddedCount++;
        }
      } catch (batchError) {
        errors.push(`Batch ${i / BATCH_SIZE + 1} failed: ${batchError instanceof Error ? batchError.message : "Unknown error"}`);
      }
    }

    return new Response(JSON.stringify({
      embedded: embeddedCount,
      total: products.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-product-embeddings error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
