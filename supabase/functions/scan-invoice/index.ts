import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VISION_MODEL = "google/gemini-2.5-flash";
const TEXT_MODEL = "google/gemini-2.5-flash";
const EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";

// ── Structured logger ──
const LOG_LEVEL = (Deno.env.get("LOG_LEVEL") || "info") as "debug" | "info" | "warn" | "error";
const LEVEL_PRIORITY: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level: string, tag: string, msg: string, data?: Record<string, unknown>) {
  if ((LEVEL_PRIORITY[level] ?? 1) < (LEVEL_PRIORITY[LOG_LEVEL] ?? 1)) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    tag,
    msg,
    ...(data || {}),
  };
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(JSON.stringify(entry));
}

function startTimer() {
  const start = performance.now();
  return {
    elapsed: () => Math.round(performance.now() - start),
    elapsedStr: () => `${Math.round(performance.now() - start)}ms`,
  };
}

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return "image/jpeg";
}

// ── Zod schemas for LLM extraction validation ──
const LineItemSchema = z.object({
  product_name: z.string().min(1, "Product name required"),
  batch_number: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  manufacturing_date: z.string().nullable().optional(),
  quantity: z.number().min(0, "Quantity cannot be negative"),
  free_quantity: z.number().nullable().optional(),
  purchase_price: z.number().min(0, "Price cannot be negative"),
  mrp: z.number().min(0, "MRP cannot be negative"),
  gst_percentage: z.number().min(0).max(100, "GST must be 0-100%"),
  discount_percentage: z.number().min(0).max(100).nullable().optional(),
  hsn_code: z.string().nullable().optional(),
  total_price: z.number(),
  extraction_confidence: z.number().min(0).max(100).nullable().optional(),
  raw_text: z.string().nullable().optional(),
});

const ExtractedInvoiceSchema = z.object({
  supplier_name: z.string().min(1),
  invoice_number: z.string().min(1),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  challan_number: z.string().nullable().optional(),
  line_items: z.array(LineItemSchema).min(1, "At least one line item required"),
  total_amount: z.number(),
  freight_charges: z.number().nullable().optional(),
  handling_charges: z.number().nullable().optional(),
  other_charges: z.number().nullable().optional(),
  discount_amount: z.number().nullable().optional(),
  gst_amount: z.number().nullable().optional(),
});

interface AnomalyFlag {
  line_index: number;
  type: string;
  field: string;
  detail: string;
}

function detectAnomalies(extracted: Record<string, unknown>): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];
  const items = extracted.line_items as any[];
  const invoiceDate = extracted.invoice_date as string;
  if (!items) return flags;

  items.forEach((item, i) => {
    if (typeof item.gst_percentage === 'number' && item.gst_percentage > 40) {
      flags.push({ line_index: i, type: 'high_gst', field: 'gst_percentage', detail: `GST ${item.gst_percentage}% exceeds 40%` });
    }
    if (typeof item.quantity === 'number' && item.quantity < 0) {
      flags.push({ line_index: i, type: 'negative_quantity', field: 'quantity', detail: `Quantity is ${item.quantity}` });
    }
    if (item.expiry_date && invoiceDate) {
      try {
        if (new Date(item.expiry_date) < new Date(invoiceDate)) {
          flags.push({ line_index: i, type: 'expired_before_invoice', field: 'expiry_date', detail: `Expiry ${item.expiry_date} before invoice date ${invoiceDate}` });
        }
      } catch { /* invalid date */ }
    }
    if (typeof item.mrp === 'number' && typeof item.purchase_price === 'number' && item.mrp > 0 && item.purchase_price > 0 && item.mrp < item.purchase_price) {
      flags.push({ line_index: i, type: 'mrp_below_cost', field: 'mrp', detail: `MRP ₹${item.mrp} < Purchase ₹${item.purchase_price}` });
    }
  });
  return flags;
}

function checkHallucination(item: Record<string, unknown>): number {
  const rawText = (item.raw_text as string) || '';
  const productName = (item.product_name as string) || '';
  if (!rawText || !productName) return 0;
  const rawLower = rawText.toLowerCase();
  const nameLower = productName.toLowerCase();
  const nameWords = nameLower.split(/\s+/).filter(w => w.length > 2);
  if (nameWords.length === 0) return 0;
  const matchedWords = nameWords.filter(w => rawLower.includes(w));
  const matchRatio = matchedWords.length / nameWords.length;
  if (matchRatio >= 0.8) return 0;
  if (matchRatio >= 0.5) return 20;
  return 40;
}

// ── Helper: extract JSON from LLM response (handles markdown wrappers) ──
function extractJSON(text: string): Record<string, unknown> {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

// ────────────────────────────────────────────────────────────
// STAGE A: OCR + Layout — extract raw text AND detect structure
// ────────────────────────────────────────────────────────────
async function stageA_extractRawTextWithLayout(
  imageContents: { type: string; image_url: { url: string } }[],
  apiKey: string
): Promise<{ rawText: string; layout: Record<string, unknown> }> {
  const stageTimer = startTimer();
  log("info", "stageA", "start", { page_count: imageContents.length });

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: "system",
          content: `You are an invoice OCR and layout analyzer. Do TWO things from the invoice image(s):

1. Extract ALL visible text exactly as it appears. Preserve layout with line breaks. No summarization.

2. Detect the invoice structure — return a JSON object with:
   - format_type: "standard_table"|"compact_grid"|"multi_section"|"gst_compliant"|"pharma_specific"|"unstructured"
   - format_confidence: 0-100
   - page_layout: description string
   - field_positions: {supplier_info, invoice_details, line_items_table, totals_section, tax_breakdown}
   - table_structure: {has_header_row(bool), column_order(string[]), row_pattern(string), multi_line_items(bool)}
   - special_features: string[]

Output in this exact format:
---RAW_TEXT---
[all extracted text here]
---LAYOUT_JSON---
{the layout JSON object}`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all text and detect the layout structure from these invoice page(s)." },
            ...imageContents,
          ],
        },
      ],
      max_tokens: 4096,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    log("error", "stageA", "vision_llm_error", { status: response.status, body_snippet: err.substring(0, 500) });
    throw new Error(`Stage A failed (${response.status}): ${err}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content || "";

  // Parse the dual-format response
  const rawMatch = content.match(/---RAW_TEXT---\s*([\s\S]*?)\s*---LAYOUT_JSON---/i);
  const layoutMatch = content.match(/---LAYOUT_JSON---\s*([\s\S]*?)$/i);

  const rawText = rawMatch ? rawMatch[1].trim() : content.trim();
  if (!rawText) throw new Error("Stage A: No text extracted");

  let layout: Record<string, unknown> = { format_type: "unstructured", format_confidence: 0 };
  if (layoutMatch) {
    try {
      layout = extractJSON(layoutMatch[1].trim());
    } catch {
      log("warn", "stageA", "layout_parse_failed", {});
    }
  }

  log("info", "stageA", "done", {
    elapsed_ms: stageTimer.elapsed(),
    raw_text_length: rawText.length,
    format_type: layout.format_type,
    format_confidence: layout.format_confidence,
    usage: json.usage,
  });

  return { rawText, layout };
}

// ────────────────────────────────────────────────────────────
// STAGE B: Structured extraction — text to invoice JSON (NO ERP)
// ────────────────────────────────────────────────────────────
async function stageB_extractStructured(
  rawText: string,
  layout: Record<string, unknown>,
  apiKey: string
): Promise<Record<string, unknown>> {
  const stageTimer = startTimer();
  const textLength = rawText.length;
  const truncatedLength = Math.min(textLength, 12000);

  log("info", "stageB", "start", {
    raw_text_length: textLength,
    text_truncated: textLength > 12000,
    truncated_length: truncatedLength,
    layout_type: layout.format_type,
  });

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [
        {
          role: "system",
          content: `You are a purchase invoice data extraction engine. Extract structured data from raw OCR text.

RULES:
- Extract data EXACTLY as it appears in the text. Do NOT guess, correct, or substitute values.
- Extract the product name as written on the invoice — do NOT normalize it.
- For dates, use YYYY-MM-DD format.
- For amounts, use numbers without currency symbols.
- If a field is not present, use null.
- Every line item MUST include raw_text: the exact OCR text span for that row (for verification).

The invoice layout is: ${JSON.stringify(layout)}`,
        },
        { role: "user", content: rawText.substring(0, 12000) },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_invoice_data",
            description: "Extract structured purchase invoice data from raw OCR text",
            parameters: {
              type: "object",
              properties: {
                supplier_name: { type: "string" },
                supplier_gst: { type: "string", nullable: true },
                supplier_dl_number: { type: "string", nullable: true },
                supplier_address: { type: "string", nullable: true },
                supplier_phone: { type: "string", nullable: true },
                supplier_email: { type: "string", nullable: true },
                invoice_number: { type: "string" },
                invoice_date: { type: "string", description: "YYYY-MM-DD" },
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
                      extraction_confidence: { type: "number", minimum: 0, maximum: 100 },
                      raw_text: { type: "string", description: "Exact OCR text span for this line item" },
                    },
                    required: ["product_name", "quantity", "purchase_price", "mrp", "gst_percentage", "total_price", "raw_text"],
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
      max_tokens: 4096,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    log("error", "stageB", "llm_error", {
      status: response.status,
      body_snippet: err.substring(0, 500),
      elapsed_ms: stageTimer.elapsed(),
    });
    throw new Error(`Stage C extraction failed (${response.status}): ${err}`);
  }

  const json = await response.json();
  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    log("error", "stageB", "no_tool_call", {
      response_snippet: JSON.stringify(json).substring(0, 500),
      elapsed_ms: stageTimer.elapsed(),
    });
    throw new Error("Stage C: LLM did not return structured data");
  }

  const usage = json.usage || {};
  const extracted = extractJSON(toolCall.function.arguments) as Record<string, unknown>;

  log("info", "stageB", "done", {
    elapsed_ms: stageTimer.elapsed(),
    llm_latency_ms: stageTimer.elapsed(),
    prompt_tokens: usage.prompt_tokens || "unknown",
    completion_tokens: usage.completion_tokens || "unknown",
    total_tokens: usage.total_tokens || "unknown",
    supplier_name: extracted.supplier_name,
    invoice_number: extracted.invoice_number,
    line_item_count: (extracted.line_items as any[])?.length || 0,
    total_amount: extracted.total_amount,
  });

  return extracted;
}

// ────────────────────────────────────────────────────────────
// STAGE C: Product reconciliation — match, validate, flag
// ────────────────────────────────────────────────────────────
async function stageC_reconcileProducts(
  extractedData: Record<string, unknown>,
  companyId: string,
  suppliers: any[],
  products: any[],
  supabase: any,
  apiKey: string,
  matchedSupplierId: string | null
): Promise<{
  enriched: Record<string, unknown>;
  validationErrors: string[];
  anomalyFlags: AnomalyFlag[];
}> {
  const stageTimer = startTimer();
  log("info", "stageC", "start", {
    supplier_count: suppliers.length,
    product_count: products.length,
    line_item_count: (extractedData.line_items as any[])?.length || 0,
    supplier_name: extractedData.supplier_name,
    invoice_number: extractedData.invoice_number,
    matched_supplier_id: matchedSupplierId,
  });

  // ── Schema validation ──
  let validationErrors: string[] = [];
  try {
    ExtractedInvoiceSchema.parse(extractedData);
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      validationErrors = e.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      log("warn", "stageC", "validation_errors", {
        error_count: validationErrors.length,
        errors: validationErrors,
      });
    }
  }

  // ── Anomaly detection ──
  const anomalyFlags = detectAnomalies(extractedData);
  if (anomalyFlags.length > 0) {
    log("warn", "stageC", "anomalies_detected", {
      anomaly_count: anomalyFlags.length,
      anomalies: anomalyFlags.map(f => `${f.type}:${f.field}`),
    });
  }

  // ── Hallucination check ──
  let hallucinationCount = 0;
  if (extractedData.line_items) {
    for (const item of extractedData.line_items as any[]) {
      const penalty = checkHallucination(item);
      if (penalty > 0) {
        const currentConf = typeof item.extraction_confidence === 'number' ? item.extraction_confidence : 70;
        item.extraction_confidence = Math.max(0, currentConf - penalty);
        item._hallucination_flagged = true;
        hallucinationCount++;
      }
    }
    if (hallucinationCount > 0) {
      log("warn", "stageC", "hallucinations_flagged", { count: hallucinationCount });
    }
  }

  // ── Product matching ──
  let exactMatches = 0;
  let semanticMatches = 0;
  let unmatched = 0;
  const matchMethods: Record<string, number> = {};

  if (products && extractedData.line_items) {
    const SEMANTIC_CAP = 85;
    const FINGERPRINT_CAP = 90;
    const FUZZY_CAP = 85;

    // Pass 1: exact client-side match (fast path, no RPC)
    const itemsToMatch: any[] = [];
    for (const item of extractedData.line_items as any[]) {
      const exactMatch = products.find(
        (p: any) => p.name.toLowerCase().trim() === item.product_name.toLowerCase().trim()
      );
      if (exactMatch) {
        item.matched_product_id = exactMatch.id;
        item.matched_product_name = exactMatch.name;
        item.matching_confidence = 100;
        item.matching_method = 'exact';
        item.needs_review = false;
        item.matching_details = { method: 'exact', confidence: 100, auto_accepted: true };
        exactMatches++;
      } else {
        itemsToMatch.push(item);
      }
    }

    log("info", "stageC", "product_matching_pass1", {
      total_items: (extractedData.line_items as any[]).length,
      exact_matches: exactMatches,
      items_to_semantic_match: itemsToMatch.length,
    });

    // Pass 2: batch RPC for all unmatched items (single call)
    if (itemsToMatch.length > 0) {
      const embedTimer = startTimer();
      const productNamesToEmbed = itemsToMatch.map((i) => i.product_name);
      const embeddingsMap: Record<string, number[]> = {};
      let embedSuccess = false;
      try {
        const embedRes = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: EMBEDDING_MODEL, input: productNamesToEmbed }),
        });
        if (embedRes.ok) {
          const embedJson = await embedRes.json();
          embedJson.data?.forEach((d: any, idx: number) => {
            if (productNamesToEmbed[idx]) embeddingsMap[productNamesToEmbed[idx]] = d.embedding;
          });
          embedSuccess = true;
        }
      } catch (e) {
        log("error", "stageC", "batch_embedding_failed", { error: String(e) });
      }

      log("debug", "stageC", "embeddings_generated", {
        embedded_count: Object.keys(embeddingsMap).length,
        total_needed: itemsToMatch.length,
        elapsed_ms: embedTimer.elapsed(),
      });

      const embeddingsForRpc: Record<string, number[]> = {};
      for (const item of itemsToMatch) {
        const emb = embeddingsMap[item.product_name];
        if (emb) embeddingsForRpc[item.product_name] = emb;
      }

      const rpcTimer = startTimer();
      const { data: matchedItems } = await supabase.rpc('batch_match_products', {
        _line_items: itemsToMatch.map((i) => ({ product_name: i.product_name })),
        _company_id: companyId,
        _supplier_id: matchedSupplierId,
        _embeddings: Object.keys(embeddingsForRpc).length > 0 ? embeddingsForRpc : null,
      });

      log("info", "stageC", "batch_rpc_complete", {
        elapsed_ms: rpcTimer.elapsed(),
        items_sent: itemsToMatch.length,
        results_received: matchedItems?.length || 0,
      });

      if (matchedItems && Array.isArray(matchedItems)) {
        for (let i = 0; i < itemsToMatch.length; i++) {
          const match = matchedItems[i];
          if (!match) continue;

          itemsToMatch[i].matched_product_id = match.matched_product_id || null;
          itemsToMatch[i].matched_product_name = match.matched_product_name || null;
          itemsToMatch[i].matching_confidence = match.matching_confidence || 0;
          itemsToMatch[i].matching_method = match.matching_method || 'none';
          itemsToMatch[i].needs_review = match.needs_review !== false;
          itemsToMatch[i].matching_details = match.matching_details || { method: 'none', confidence: 0, auto_accepted: false };

          const method = match.matching_method || 'none';
          matchMethods[method] = (matchMethods[method] || 0) + 1;
          if (match.matched_product_id) {
            if (method === 'semantic' || method === 'embedding') semanticMatches++;
            else if (method !== 'exact') semanticMatches++;
          } else {
            unmatched++;
          }

          if (match.matching_method === 'alias' && matchedSupplierId) {
            await supabase.rpc('record_alias_match', {
              _supplier_id: matchedSupplierId,
              _vendor_product_name: itemsToMatch[i].product_name,
              _confidence: match.matching_confidence,
              _extracted_name: itemsToMatch[i].product_name,
            });
          }
        }
      }
    }
  }

  const totalItems = (extractedData.line_items as any[])?.length || 0;
  log("info", "stageC", "done", {
    elapsed_ms: stageTimer.elapsed(),
    total_items: totalItems,
    exact_matches: exactMatches,
    semantic_matches: semanticMatches,
    unmatched: unmatched,
    match_methods: matchMethods,
    validation_errors: validationErrors.length,
    anomaly_flags: anomalyFlags.length,
    hallucinations_flagged: hallucinationCount,
  });

  return { enriched: extractedData, validationErrors, anomalyFlags };
}

// ════════════════════════════════════════════════════════════
// MAIN: Invoice scan orchestrator
// ════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestTimer = startTimer();
  let userId = "unknown";
  let companyId = "";

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
    userId = user.id;

    const { file_paths, company_id } = await req.json();
    if (!file_paths || !Array.isArray(file_paths) || file_paths.length === 0 || !company_id) {
      throw new Error("file_paths (array) and company_id are required");
    }
    companyId = company_id;

    log("info", "request", "start", {
      user_id: userId,
      company_id: companyId,
      file_count: file_paths.length,
      files: file_paths,
    });

    // Verify user belongs to company
    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
    if (profileError) throw new Error("Failed to verify company membership");
    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    const callerCompany = profile?.company_id;
    if (!isSuperAdmin && callerCompany !== companyId) {
      log("warn", "request", "forbidden", {
        user_id: userId,
        caller_company: callerCompany,
        requested_company: companyId,
      });
      return new Response(JSON.stringify({ error: "Forbidden: company mismatch" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file paths are scoped to company
    for (const fp of file_paths) {
      if (typeof fp !== "string" || !fp.startsWith(`${companyId}/`)) {
        return new Response(JSON.stringify({ error: `Forbidden: file path outside company scope: ${fp}` }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ══ Download files in parallel ══
    const downloadTimer = startTimer();
    const imageContents = await Promise.all(
      file_paths.map(async (filePath: string) => {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("invoices").download(filePath);
        if (downloadError || !fileData) throw new Error(`Failed to download: ${filePath}`);
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        const base64 = base64Encode(uint8);
        return {
          type: "image_url" as const,
          image_url: { url: `data:${getMimeType(filePath)};base64,${base64}` },
        };
      })
    );
    log("info", "request", "files_downloaded", {
      count: imageContents.length,
      elapsed_ms: downloadTimer.elapsed(),
    });

    // ══ Fetch context data for reconciliation ══
    const contextTimer = startTimer();
    const { data: suppliers } = await supabase
      .from("suppliers").select("id, name").eq("company_id", companyId);
    const { data: products } = await supabase
      .from("products")
      .select("id, name, gst_percentage, hsn_code, mrp, purchase_price, fingerprint, brand, strength, form, pack_size")
      .eq("company_id", companyId);
    log("info", "request", "context_fetched", {
      supplier_count: suppliers?.length || 0,
      product_count: products?.length || 0,
      elapsed_ms: contextTimer.elapsed(),
    });

    // ──────────────────────────────────────────────────────
    // PIPELINE: Stage A (OCR+Layout) → B (Extract) → C (Reconcile)
    // ──────────────────────────────────────────────────────

    console.log("[Stage A] Extracting raw OCR text + detecting layout...");
    let rawText: string;
    let layout: Record<string, unknown>;
    try {
      const result = await stageA_extractRawTextWithLayout(imageContents, LOVABLE_API_KEY);
      rawText = result.rawText;
      layout = result.layout;
    } catch (e) {
      log("error", "pipeline", "stageA_failed", {
        error: e instanceof Error ? e.message : "Unknown error",
        elapsed_ms: requestTimer.elapsed(),
      });
      return new Response(JSON.stringify({
        error: "OCR + layout detection failed",
        stage: "A",
        detail: e instanceof Error ? e.message : "Unknown error",
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("[Stage B] Extracting structured data from text...");
    let extractedData: Record<string, unknown>;
    try {
      extractedData = await stageB_extractStructured(rawText, layout, LOVABLE_API_KEY);
    } catch (e) {
      log("error", "pipeline", "stageB_failed", {
        error: e instanceof Error ? e.message : "Unknown error",
        elapsed_ms: requestTimer.elapsed(),
      });
      return new Response(JSON.stringify({
        error: "Data extraction failed",
        stage: "B",
        detail: e instanceof Error ? e.message : "Unknown error",
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("[Stage C] Reconciling products, validating, detecting anomalies...");
    let matchedSupplierId: string | null = null;
    if (suppliers && extractedData.supplier_name) {
      const match = suppliers.find(
        (s: any) => s.name.toLowerCase().trim() === (extractedData.supplier_name as string).toLowerCase().trim()
      );
      if (match) matchedSupplierId = match.id;
      log("debug", "pipeline", "supplier_match", {
        extracted_name: extractedData.supplier_name,
        matched: !!match,
        matched_id: match?.id || null,
      });
    }

    let enriched: Record<string, unknown>;
    let validationErrors: string[];
    let anomalyFlags: AnomalyFlag[];
    try {
      const result = await stageC_reconcileProducts(
        extractedData, companyId, suppliers || [], products || [], supabase, LOVABLE_API_KEY, matchedSupplierId
      );
      enriched = result.enriched;
      validationErrors = result.validationErrors;
      anomalyFlags = result.anomalyFlags;
    } catch (e) {
      log("error", "pipeline", "stageC_failed", {
        error: e instanceof Error ? e.message : "Unknown error",
        elapsed_ms: requestTimer.elapsed(),
      });
      return new Response(JSON.stringify({
        error: "Product reconciliation failed",
        stage: "C",
        detail: e instanceof Error ? e.message : "Unknown error",
        partial_data: extractedData,
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Store learned invoice format ──
    if (matchedSupplierId && layout.format_type) {
      const fingerprint = `${layout.format_type}_${String((layout.table_structure as any)?.column_order?.join(',') || '')}`
        .replace(/\s/g, '_').substring(0, 255);
      await supabase.rpc('upsert_learned_invoice_format', {
        _supplier_id: matchedSupplierId, _company_id: companyId,
        _format_type: layout.format_type,
        _format_confidence: layout.format_confidence,
        _page_layout: layout.page_layout || null,
        _field_positions: layout.field_positions || null,
        _table_structure: layout.table_structure || null,
        _special_features: JSON.stringify(layout.special_features || []),
        _column_mappings: JSON.stringify({}),
        _format_fingerprint: fingerprint, _user_id: user.id,
      });
      log("debug", "request", "format_stored", {
        supplier_id: matchedSupplierId,
        fingerprint,
      });
    }

    // ── Fetch learned formats for response ──
    let learnedFormats: any[] = [];
    if (matchedSupplierId) {
      const { data: formats } = await supabase
        .from('supplier_invoice_formats')
        .select('format_type, format_confidence, column_mappings')
        .eq('supplier_id', matchedSupplierId)
        .order('total_scanned', { ascending: false });
      learnedFormats = formats || [];
    }

    const totalElapsed = requestTimer.elapsed();
    const itemCount = (enriched.line_items as any[])?.length || 0;

    log("info", "request", "done", {
      total_elapsed_ms: totalElapsed,
      invoice_number: enriched.invoice_number,
      supplier_name: enriched.supplier_name,
      matched_supplier_id: matchedSupplierId,
      line_items: itemCount,
      validation_passed: validationErrors.length === 0,
      anomaly_count: anomalyFlags.length,
      pipeline_stages: ['ocr+layout', 'extraction', 'reconciliation'],
    });

    return new Response(JSON.stringify({
      ...enriched,
      matched_supplier_id: matchedSupplierId,
      learned_formats: learnedFormats,
      format_analysis: {
        format_type: layout.format_type || "unstructured",
        format_confidence: layout.format_confidence || 0,
        page_layout: layout.page_layout || null,
        field_positions: layout.field_positions || null,
        table_structure: layout.table_structure || null,
        special_features: layout.special_features || [],
      },
      _pipeline: {
        stage_a_ocr_length: rawText.length,
        stage_a_layout: layout,
        stages: ['ocr+layout', 'extraction', 'reconciliation'],
        total_elapsed_ms: totalElapsed,
      },
      _validation: {
        schema_errors: validationErrors,
        anomaly_flags: anomalyFlags,
        validation_passed: validationErrors.length === 0,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    log("error", "request", "fatal", {
      error: e instanceof Error ? e.message : "Unknown error",
      user_id: userId,
      company_id: companyId,
      elapsed_ms: requestTimer.elapsed(),
    });
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
