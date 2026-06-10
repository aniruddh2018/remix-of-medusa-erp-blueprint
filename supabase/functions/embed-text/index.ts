import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIREWORKS_API_KEY = Deno.env.get("FIREWORKS_API_KEY");
    if (!FIREWORKS_API_KEY) throw new Error("FIREWORKS_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing required Supabase environment variables");
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    const { texts } = await req.json();
    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      throw new Error("texts array is required");
    }

    const res = await fetch("https://api.fireworks.ai/inference/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIREWORKS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nomic-ai/nomic-embed-text-v1.5",
        input: texts,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Embedding API error ${res.status}: ${err}`);
    }

    const json = await res.json();
    const embeddings = json.data?.map((d: any) => d.embedding) || [];

    return new Response(JSON.stringify({ embeddings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("embed-text error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
