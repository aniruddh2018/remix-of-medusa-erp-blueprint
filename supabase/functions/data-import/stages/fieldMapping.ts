import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const FIREWORKS_MODEL = "google/gemini-2.5-flash";
const FIREWORKS_API_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ─── Zod schema ──────────────────────────────────────────────────────────────

const FieldMappingSchema = z.object({
  source_field: z.string(),
  target_field: z.string(),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  transformation: z.string().nullable().optional(),
});

const FieldMappingOutput = z.object({
  mappings: z.array(FieldMappingSchema),
  unmapped_source: z.array(z.string()).optional(),
  unmapped_target: z.array(z.string()).optional(),
  detected_erp: z.string().nullable().optional(),
  notes: z.string().optional(),
});

export type FieldMappingResult = z.infer<typeof FieldMappingOutput> & {
  error?: string;
};

export type AIMappingSuggestion = z.infer<typeof FieldMappingSchema>;

// ─── Target schema descriptions per entity ───────────────────────────────────

const TARGET_SCHEMAS: Record<string, string> = {
  product: `Products table: name(required), manufacturer(required), category, unit, mrp(number), purchase_price(number), sale_price(number), gst_percentage(number 0-100), hsn_code, generic_name, composition, strength, drug_schedule(enum: none/schedule_h/schedule_h1/schedule_x/narcotic), min_stock_level, max_stock_level, reorder_level`,
  supplier: `Suppliers table: name(required), contact_person, phone, email, gst_number(GSTIN format, 15 chars), drug_license_number, address`,
  customer: `Customers table: name(required), phone, email, address, gst_number(GSTIN format)`,
  inventory_batch: `Inventory batches table: product_name(required - references products.name), batch_number(required), quantity(number), purchase_price(number), mrp(number), expiry_date(date YYYY-MM-DD, required), manufacturing_date(date), supplier_name(references suppliers.name)`,
  purchase_order: `Purchase orders table: invoice_number(required), supplier_name(required - references supplier), order_date(date), total_amount(number), gst_amount(number), discount_amount(number), status(enum: pending/confirmed/shipped/delivered/cancelled)`,
  sales_order: `Sales orders table: invoice_number(required), customer_name(required), customer_phone, order_date(date), total_amount(number), gst_amount(number), discount_amount(number), status(enum: pending/confirmed/shipped/delivered/cancelled)`,
  payment: `Payments table: amount(number, required), payment_type(purchase or sale), reference_type, reference_number, party_name(required), payment_method(cash/upi/bank_transfer/cheque), payment_date(date)`,
};

// ─── Main function ───────────────────────────────────────────────────────────

export async function suggestFieldMappings(
  sourceColumns: { name: string; detectedType: string; sampleValues: string[] }[],
  targetEntity: string,
  apiKey: string
): Promise<FieldMappingResult> {
  const startTime = performance.now();

  const sourceDesc = sourceColumns
    .map(c => `"${c.name}" (type: ${c.detectedType}, samples: ${c.sampleValues.slice(0, 3).join(", ")})`)
    .join("\n");

  const targetDesc = TARGET_SCHEMAS[targetEntity] || `Unknown entity: ${targetEntity}`;

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
          content: `You are a data field mapping expert for ERP imports. Map source columns to target database fields.

Rules:
- Match semantically: "Stock Item Name" or "Product" → name, "Rate" or "Unit Price" → purchase_price
- "HSN" or "HSN Code" or "HSN/SAC" → hsn_code
- "GST %" or "Tax %" → gst_percentage
- "Batch" or "Batch No" or "Lot Number" → batch_number
- "Expiry" or "Exp Date" or "Best Before" → expiry_date
- "Mfg" or "Mfg Date" → manufacturing_date
- "Qty" or "QTY" or "Box" or "Pcs" → quantity
- "MRP" → mrp
- "Purchase Rate" or "Cost Price" or "Rate" → purchase_price
- "Invoice No" or "Bill No" or "Document No" → invoice_number
- "Supplier" or "Vendor" or "Party Name" → supplier_name
- "Customer" or "Buyer" or "Client Name" → customer_name
- "GSTIN" or "GST No" → gst_number (supplier/customer)
- "DL No" or "Drug License" → drug_license_number

Confidence scoring:
- 95-100: Exact name match (case-insensitive, underscores/spaces normalized)
- 80-94: Clear semantic match with corroborating sample data
- 60-79: Probable match but ambiguous
- <60: Best guess — flag for manual review

Suggest transformation if source needs it:
- "cast:number" if source is string but target is numeric
- "cast:date" if date format needs normalization
- null if no transformation needed

Mark unmapped_source for columns you cannot confidently map.
Mark unmapped_target for required target fields with no matching source.

Be thorough — every source column should be mapped or listed as unmapped.`,
        },
        {
          role: "user",
          content: `Target entity: ${targetEntity}\nTarget schema:\n${targetDesc}\n\nSource columns:\n${sourceDesc}\n\nMap each source column to the best target field.`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "suggest_mappings",
            description: "Generate field mappings from source to target",
            parameters: {
              type: "object",
              properties: {
                mappings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      source_field: { type: "string" },
                      target_field: { type: "string" },
                      confidence: { type: "number", minimum: 0, maximum: 100 },
                      reasoning: { type: "string" },
                      transformation: { type: "string", nullable: true },
                    },
                    required: ["source_field", "target_field", "confidence", "reasoning"],
                  },
                },
                unmapped_source: {
                  type: "array",
                  items: { type: "string" },
                  description: "Source columns that could not be confidently mapped",
                },
                unmapped_target: {
                  type: "array",
                  items: { type: "string" },
                  description: "Target fields without any matching source column",
                },
                detected_erp: {
                  type: "string",
                  nullable: true,
                  description: "Detected source ERP system (tally, sap, zoho, quickbooks, generic)",
                },
                notes: { type: "string" },
              },
              required: ["mappings"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "suggest_mappings" } },
      max_tokens: 2048,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`Field mapping AI error (${response.status}):`, err.substring(0, 500));
    return { mappings: [], error: `AI error (${response.status})` };
  }

  const json = await response.json();
  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall) {
    console.error("Field mapping: no tool call", JSON.stringify(json).substring(0, 300));
    return { mappings: [], error: "No structured output from AI" };
  }

  try {
    const args = JSON.parse(toolCall.function.arguments);
    const validated = FieldMappingOutput.parse(args);

    const elapsed = Math.round(performance.now() - startTime);
    console.log(`Field mapping complete in ${elapsed}ms: ${validated.mappings.length} mappings, detected ERP: ${validated.detected_erp || "unknown"}`);

    return validated;
  } catch (err) {
    console.error("Field mapping parse/Zod error:", err);
    return { mappings: [], error: `Parse error: ${(err as Error).message}` };
  }
}
