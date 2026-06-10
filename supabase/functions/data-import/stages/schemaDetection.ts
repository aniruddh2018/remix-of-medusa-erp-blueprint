import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const FIREWORKS_MODEL = "google/gemini-2.5-flash";
const FIREWORKS_API_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ─── Zod schemas for LLM output validation ───────────────────────────────────

const ColumnSchema = z.object({
  name: z.string(),
  detected_type: z.enum(["string", "number", "date", "boolean", "email", "phone", "gst", "unknown"]),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
});

const SchemaDetectionOutput = z.object({
  suggested_entity: z.enum(["product", "supplier", "customer", "inventory_batch", "purchase_order", "sales_order", "payment"]),
  entity_confidence: z.number().min(0).max(100),
  columns: z.array(ColumnSchema),
  notes: z.string().optional(),
});

export type SchemaDetectionResult = z.infer<typeof SchemaDetectionOutput> & {
  error?: string;
};

export type DetectedColumnAI = z.infer<typeof ColumnSchema>;

// ─── Main function ───────────────────────────────────────────────────────────

export async function detectSchemaWithAI(
  headers: string[],
  sampleRows: Record<string, unknown>[],
  apiKey: string
): Promise<SchemaDetectionResult> {
  const startTime = performance.now();

  // Build a compact representation: headers + first 10 sample rows
  const sample = sampleRows.slice(0, 10);
  const sampleTable = [headers.join(","), ...sample.map(r => headers.map(h => String(r[h] ?? "")).join(","))].join("\n");

  const response = await fetch(FIREWORKS_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: FIREWORKS_MODEL,
      messages: [
        {
          role: "system",
          content: `You are a data schema detector for an ERP system serving pharmacies, distributors, and retailers.

Your job: analyze tabular data (CSV-like) and determine:
1. What ERP entity type this data represents (product, supplier, customer, inventory_batch, purchase_order, sales_order, or payment)
2. For each column: the detected type and your confidence

Guidelines:
- Look at column NAMES first, then sample values
- "product_name" + "batch_number" + "expiry_date" → inventory_batch
- "name" + "manufacturer" + "mrp" → product  
- "name" + "gst_number" + "contact_person" → supplier
- "name" + "phone" + "email" (no GST) → customer
- "invoice_number" + "supplier_name" → purchase_order
- "invoice_number" + "customer_name" → sales_order
- "amount" + "payment_method" → payment
- Confidence < 70 means you're guessing — be honest
- Do NOT invent fields or data. Only analyze what is provided.`,
        },
        {
          role: "user",
          content: `Analyze this data and return the schema:\n\n${sampleTable}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "detect_schema",
            description: "Detect the schema of the provided tabular data",
            parameters: {
              type: "object",
              properties: {
                suggested_entity: {
                  type: "string",
                  enum: ["product", "supplier", "customer", "inventory_batch", "purchase_order", "sales_order", "payment"],
                },
                entity_confidence: { type: "number", minimum: 0, maximum: 100 },
                columns: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      detected_type: {
                        type: "string",
                        enum: ["string", "number", "date", "boolean", "email", "phone", "gst", "unknown"],
                      },
                      confidence: { type: "number", minimum: 0, maximum: 100 },
                      reasoning: { type: "string" },
                    },
                    required: ["name", "detected_type", "confidence", "reasoning"],
                  },
                },
                notes: { type: "string" },
              },
              required: ["suggested_entity", "entity_confidence", "columns"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "detect_schema" } },
      max_tokens: 2048,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`Schema detection AI error (${response.status}):`, err.substring(0, 500));
    return { suggested_entity: "product", entity_confidence: 0, columns: [], error: `AI error (${response.status})` };
  }

  const json = await response.json();
  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall) {
    console.error("Schema detection: no tool call in response", JSON.stringify(json).substring(0, 300));
    return { suggested_entity: "product", entity_confidence: 0, columns: [], error: "No structured output from AI" };
  }

  try {
    const args = JSON.parse(toolCall.function.arguments);
    const validated = SchemaDetectionOutput.parse(args);

    const elapsed = Math.round(performance.now() - startTime);
    console.log(`Schema detection complete in ${elapsed}ms: ${validated.suggested_entity} (${validated.entity_confidence}%)`);

    return validated;
  } catch (err) {
    console.error("Schema detection parse/Zod error:", err);
    return {
      suggested_entity: "product",
      entity_confidence: 0,
      columns: [],
      error: `Parse error: ${(err as Error).message}`,
    };
  }
}
