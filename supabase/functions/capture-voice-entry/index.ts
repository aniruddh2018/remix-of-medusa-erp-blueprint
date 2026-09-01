// Voice → structured, product-resolved line items.
//
// Pipeline: S3 upload -> AWS Transcribe (async job, polled) -> transcript
// text -> Bedrock Converse (Llama 4 Scout) for brand-name correction +
// extraction -> batch_match_products (existing exact/alias/vector-hybrid
// matcher, unchanged) -> resolve_conversion for spoken units. Always
// returns for review; never posts directly.
//
// Unlike the earlier Gemini-based version, transcription and correction are
// two separate calls — Llama (like Claude) has no native audio input, and
// Transcribe's job-based API can't be inlined into one request the way
// Gemini's multimodal chat completions could.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callBedrockConverse, type ConverseToolSpec } from "../_shared/bedrock.ts";
import { s3PutObject, s3GetObject } from "../_shared/s3.ts";
import { startTranscriptionJob, getTranscriptionJob } from "../_shared/transcribe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Transcribe jobs for a short clip typically finish in a few seconds, but
// this is a real job queue, not instant — cap total wait so the request
// doesn't hang indefinitely if something's stuck.
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_MS = 25000;

const VOICE_CAPTURE_TOOL: ConverseToolSpec = {
  name: "extract_voice_order",
  description: "Correct mis-transcribed brand names against the given catalog and extract structured line items from a shop voice note transcript",
  inputSchema: {
    json: {
      type: "object",
      properties: {
        party_name: { type: ["string", "null"] },
        payment_mode: { type: ["string", "null"] },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product_name: { type: "string", description: "Corrected product/brand name, matched against the catalog when a close phonetic match exists" },
              quantity: { type: "number" },
              unit: { type: ["string", "null"], description: "Unit spoken, e.g. strip/box/tablet/pcs. null if not mentioned." },
              rate: { type: ["number", "null"] },
            },
            required: ["product_name", "quantity"],
          },
        },
      },
      required: ["line_items"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { audio_base64, transaction_type } = await req.json();
    if (!audio_base64) throw new Error("audio_base64 is required");

    const bucket = Deno.env.get("VOICE_CAPTURE_S3_BUCKET");
    if (!bucket) throw new Error("VOICE_CAPTURE_S3_BUCKET not configured");

    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
    const companyId = profile?.company_id;
    if (!companyId) throw new Error("No company found for user");

    // 1. Upload audio to S3 (Transcribe requires an S3 source, no inline body).
    const audioBytes = Uint8Array.from(atob(audio_base64), (c) => c.charCodeAt(0));
    const jobName = `voice-capture-${companyId}-${Date.now()}`;
    const audioKey = `voice-input/${jobName}.webm`;
    await s3PutObject(bucket, audioKey, audioBytes, "audio/webm");

    // 2. Start + poll the transcription job.
    await startTranscriptionJob({
      jobName,
      mediaFileUri: `s3://${bucket}/${audioKey}`,
      outputBucketName: bucket,
    });

    const deadline = Date.now() + MAX_POLL_MS;
    let jobStatus = await getTranscriptionJob(jobName);
    while (jobStatus.status === "IN_PROGRESS" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      jobStatus = await getTranscriptionJob(jobName);
    }
    if (jobStatus.status === "FAILED") {
      throw new Error(`Transcription failed: ${jobStatus.failureReason || "unknown reason"}`);
    }
    if (jobStatus.status === "IN_PROGRESS") {
      throw new Error("Transcription is taking longer than expected — please try again shortly.");
    }

    // 3. Fetch the transcript from our own output bucket (OutputBucketName
    // means the result lands at a known key, not a service-managed URI).
    const transcriptJson = await s3GetObject(bucket, `${jobName}.json`);
    const transcript: string = JSON.parse(transcriptJson).results.transcripts[0].transcript;

    // 4. Catalog for brand-name correction context.
    const { data: catalog } = await supabase
      .from("products").select("name").eq("company_id", companyId).eq("is_active", true)
      .order("updated_at", { ascending: false }).limit(300);
    const catalogNames = (catalog || []).map((p) => p.name);

    // 5. Correction + extraction (Llama via Bedrock Converse).
    const response = await callBedrockConverse({
      system:
        "You correct speech-to-text transcripts of Indian shop voice notes and extract line items. " +
        "Fix any mis-transcribed product/brand names using ONLY the given catalog list when a close " +
        "phonetic match exists; otherwise keep the spoken name as-is. Also extract the unit if one " +
        "is spoken (strip, box, tablet, pcs, etc) — null if no unit was mentioned.",
      messages: [
        {
          role: "user",
          content: [{ text: JSON.stringify({ transcript, catalog: catalogNames, transaction_type: transaction_type || "sale" }) }],
        },
      ],
      tools: [VOICE_CAPTURE_TOOL],
      forceToolName: "extract_voice_order",
    });

    const toolUseBlock = response.output.message.content.find((b) => b.toolUse);
    if (!toolUseBlock?.toolUse) throw new Error("AI did not return structured data");
    const extracted: any = toolUseBlock.toolUse.input;

    // 6. Check this company's own learned corrections first (exact phrase
    // match) — cheap, and the source of the compounding-accuracy effect.
    const rawItems = extracted.line_items as { product_name: string; quantity: number; unit: string | null; rate: number | null }[];
    const normalized = (s: string) => s.trim().toLowerCase();
    const { data: aliasRows } = await supabase
      .from("company_product_aliases")
      .select("raw_phrase, product_id")
      .eq("company_id", companyId)
      .in("raw_phrase", rawItems.map((i) => normalized(i.product_name)));
    const aliasMap = new Map((aliasRows || []).map((a) => [a.raw_phrase, a.product_id]));

    // 7. Whatever the alias table didn't resolve falls through to the
    // existing exact/alias/vector-hybrid matcher — no new matching logic.
    const unresolved = rawItems.filter((i) => !aliasMap.has(normalized(i.product_name)));
    let matched: Array<{ product_id?: string; matching_details?: { confidence?: number } }> = [];
    if (unresolved.length > 0) {
      const { data, error: matchError } = await supabase.rpc("batch_match_products", {
        _line_items: unresolved.map((i) => ({ product_name: i.product_name })),
        _company_id: companyId,
      });
      if (matchError) throw matchError;
      matched = data || [];
    }

    let unresolvedIdx = 0;
    const resolvedItems = rawItems.map((item) => {
      const aliasHit = aliasMap.get(normalized(item.product_name));
      const m = aliasHit ? { product_id: aliasHit, matching_details: { confidence: 100 } } : matched[unresolvedIdx++] || {};
      return { ...item, product_id: m.product_id as string | undefined, confidence: (m.matching_details?.confidence ?? 0) / 100 };
    });

    // 8. Unit conversion — spoken/typed quantity may be in "box"/"strip"/etc,
    // but stock (and everything downstream) is tracked in the product's own
    // base_unit. Reuses the existing resolve_conversion RPC. No confident
    // path found → lower confidence instead of silently posting the wrong
    // stock quantity.
    const productIds = [...new Set(resolvedItems.map((i) => i.product_id).filter(Boolean))] as string[];
    const { data: productRows } = productIds.length
      ? await supabase.from("products").select("id, base_unit").in("id", productIds)
      : { data: [] as { id: string; base_unit: string | null }[] };
    const baseUnitMap = new Map((productRows || []).map((p) => [p.id, p.base_unit]));

    const lineItems = await Promise.all(
      resolvedItems.map(async (item) => {
        const baseUnit = item.product_id ? baseUnitMap.get(item.product_id) : null;
        let quantity = item.quantity;
        let confidence = item.confidence;
        if (item.product_id && item.unit && baseUnit && normalized(item.unit) !== normalized(baseUnit)) {
          try {
            const { data: conv, error: convErr } = await supabase.rpc("resolve_conversion", {
              _company_id: companyId, _product_id: item.product_id, _batch_id: null,
              _from_unit: item.unit, _to_unit: baseUnit,
            });
            if (convErr || !conv?.factor) throw convErr || new Error("no factor");
            quantity = item.quantity * conv.factor;
          } catch {
            confidence = Math.min(confidence, 0.4); // unresolvable unit — force review
          }
        }
        return {
          product_id: item.product_id || null,
          product_name_raw: item.product_name,
          quantity,
          spoken_unit: item.unit,
          free_quantity: null,
          rate: item.rate ?? null,
          confidence,
        };
      })
    );

    return new Response(
      JSON.stringify({ success: true, transcript, party_name: extracted.party_name, payment_mode: extracted.payment_mode, line_items: lineItems }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
