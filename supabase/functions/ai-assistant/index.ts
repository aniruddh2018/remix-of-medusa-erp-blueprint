import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FORBIDDEN_KEYWORDS = [
  "DELETE", "UPDATE", "INSERT", "DROP", "ALTER", "CREATE",
  "TRUNCATE", "GRANT", "REVOKE", "EXECUTE", "CALL", "COPY", "VACUUM", "ANALYZE",
];

const FORBIDDEN_TABLES = [
  "auth.users", "auth.identities", "auth.sessions",
  "storage.objects", "storage.buckets",
];

const ALLOWED_TABLES = [
  "sales_orders", "sales_order_items", "customers", "suppliers",
  "products", "inventory_batches", "payments", "purchase_orders",
  "payments_sales", "companies", "doctors", "purchase_order_items",
];

const ROW_LIMITS: Record<string, number> = {
  super_admin: 100000, admin: 50000, manager: 10000,
  staff: 1000, accountant: 5000, default: 5000,
};

const PAGE_MAP: Record<string, { path: string; label: string }> = {
  dashboard: { path: "/dashboard", label: "Dashboard" },
  products: { path: "/products", label: "Products" },
  inventory: { path: "/inventory", label: "Inventory" },
  batches: { path: "/inventory", label: "Inventory (Batches)" },
  sales: { path: "/sales", label: "Sales" },
  counter_sale: { path: "/counter-sales", label: "Counter Sales" },
  customers: { path: "/customers", label: "Customers" },
  suppliers: { path: "/suppliers", label: "Suppliers" },
  purchase_orders: { path: "/purchase-orders", label: "Purchase Orders" },
  payments: { path: "/accounts", label: "Accounts & Payments" },
  accounts: { path: "/accounts", label: "Accounts" },
  reports: { path: "/reports", label: "Reports" },
  doctors: { path: "/doctors", label: "Doctors" },
  expiry: { path: "/expiry", label: "Expiry Tracking" },
  scheduled_drugs: { path: "/scheduled-drugs", label: "Scheduled Drugs" },
  settings: { path: "/settings", label: "Settings" },
  admin: { path: "/admin", label: "Admin Panel" },
  chat: { path: "/chat", label: "AI Assistant" },
  scan_invoice: { path: "/scan-invoice", label: "Scan Invoice" },
  data_import: { path: "/data-import", label: "Data Import" },
  credit_note: { path: "/sales", label: "Sales (Credit Notes)" },
  debit_note: { path: "/purchase-orders", label: "Purchase Orders (Debit Notes)" },
  query: { path: "/query", label: "Query Engine" },
};

interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: { intent?: string; confidence?: number };
}

interface AIAssistantRequest {
  message: string;
  conversation_id: string;
  history: ConversationMessage[];
  company_id: string;
  user_role: string;
  business_type: string;
}

function getMaxRows(userRole: string): number {
  return ROW_LIMITS[userRole] || ROW_LIMITS["default"];
}

function validateSQL(sql: string): { valid: boolean; error?: string } {
  const upper = sql.toUpperCase().trim();
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(sql)) {
      return { valid: false, error: `Forbidden operation: ${kw}` };
    }
  }
  if (!upper.startsWith("SELECT")) {
    return { valid: false, error: "Only SELECT queries allowed" };
  }
  for (const t of FORBIDDEN_TABLES) {
    if (upper.includes(t.toUpperCase())) {
      return { valid: false, error: `Access to '${t}' forbidden` };
    }
  }
  if (sql.includes(";")) {
    return { valid: false, error: "Multiple statements not allowed" };
  }
  return { valid: true };
}

function buildHistoryText(history: ConversationMessage[]): string {
  if (!history.length) return "";
  const recent = history.slice(-16);
  return recent.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n");
}

function buildSchemaContext(companyId: string): string {
  return `## ERP Database Schema:
- sales_orders (id, invoice_number, customer_name, customer_id, customer_phone, total_amount, gst_amount, discount_amount, status, payment_status, created_at, company_id)
- sales_order_items (id, sales_order_id, product_id, quantity, rate, gst_percentage, total_price)
- customers (id, name, phone, email, gst_number, address, total_purchases, company_id)
- suppliers (id, name, contact_person, phone, email, gst_number, company_id)
- products (id, name, generic_name, strength, manufacturer, mrp, sale_price, purchase_price, gst_percentage, unit, base_unit, category, is_active, company_id)
- inventory_batches (id, product_id, batch_number, expiry_date, quantity, loose_quantity, pack_size, mrp, purchase_price, supplier_id, company_id)
- payments (id, amount, party_name, party_type, payment_type, payment_method, reference_id, created_at, company_id)
- purchase_orders (id, invoice_number, supplier_id, total_amount, gst_amount, status, created_at, company_id)
- doctors (id, name, speciality, registration_number, phone, company_id)

CRITICAL SQL RULES:
- ALWAYS include WHERE company_id = '${companyId}'
- Add LIMIT clause (max ${getMaxRows("default")})
- Use ISO dates: '2026-01-01'
- GROUP BY all non-aggregated columns`;
}

function buildSystemPrompt(request: AIAssistantRequest): string {
  const historyText = buildHistoryText(request.history);
  const schemaContext = buildSchemaContext(request.company_id);
  const isPharmacy = request.business_type.startsWith("pharmacy");

  return `You are an ERP AI Assistant. You help users manage their ${isPharmacy ? "pharmacy" : "business"} ERP system.

${schemaContext}

## Your Capabilities:
1. **CRUD Actions**: Create/update customers, products, payments, sales drafts, cancel orders
2. **Data Queries**: Answer questions about business data by generating SQL
3. **Insights**: Provide business health summaries (low stock, overdue payments, expiry warnings, sales trends)
4. **Navigation**: Help users find features and pages in the app
5. **Clarification**: Ask follow-up questions when intent is ambiguous

## Conversation History:
${historyText || "(Start of conversation)"}

## User Role: ${request.user_role}

## INSTRUCTIONS:
1. ALWAYS call the classify_intent function first
2. Based on the classified intent, call the appropriate second function
3. Be concise and helpful. For queries, present data clearly. For actions, confirm before executing.
4. If the user's message is ambiguous, classify as "clarification" and ask what they meant
5. For CRUD actions, extract ALL entity fields from the message. If required fields are missing, list them in missing_fields.
${isPharmacy ? "6. This is a pharmacy ERP — understand drug names, prescriptions, schedules, batches, and expiry." : ""}`;
}

async function callLLM(apiKey: string, systemPrompt: string, userMessage: string, tools: any[], toolChoice?: any): Promise<any> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      tools,
      tool_choice: toolChoice || "auto",
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("RATE_LIMITED");
    if (response.status === 402) throw new Error("CREDITS_EXHAUSTED");
    const errText = await response.text();
    console.error("AI gateway error:", response.status, errText);
    throw new Error(`AI_CALL_FAILED:${response.status}`);
  }

  const result = await response.json();
  return result;
}

const INTENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "classify_intent",
      description: "Classify the user's message intent and extract entities",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            enum: ["crud_action", "data_query", "insight_request", "navigation_help", "clarification", "unknown"],
            description: "The classified intent of the user's message",
          },
          crud_action: {
            type: "string",
            enum: ["create_customer", "create_product", "record_payment", "create_sale_draft", "update_customer", "update_product", "cancel_order"],
            description: "Specific CRUD action if intent is crud_action",
          },
          confidence: {
            type: "number",
            description: "Confidence score 0-1",
          },
          entities: {
            type: "object",
            description: "Extracted entities from the message. For create_customer: {name, phone, email, gst_number, address}. For create_product: {name, manufacturer, mrp, purchase_price, sale_price, gst_percentage, unit, category}. For record_payment: {party_name, amount, payment_method}. For create_sale_draft: {customer_name, customer_phone, items: [{name, quantity, rate, gst_percentage}], doctor_name, prescription_number}. For data_query: {metric, dimension, time_period, filters}. For update operations: {id_or_name, fields_to_update}. For cancel_order: {invoice_number}.",
          },
          missing_fields: {
            type: "array",
            items: { type: "string" },
            description: "Required fields that could not be extracted",
          },
          reply_text: {
            type: "string",
            description: "The assistant's reply to the user (natural language). For clarification, include the question. For navigation_help, describe where to go. For unknown, suggest what the assistant can do.",
          },
        },
        required: ["intent", "confidence", "entities", "reply_text"],
      },
    },
  },
];

const SQL_TOOLS = [
  {
    type: "function",
    function: {
      name: "generate_sql",
      description: "Generate a SQL query from classified intent and entities",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "Complete PostgreSQL SELECT query" },
          explanation: { type: "string", description: "User-friendly explanation of what the query returns" },
          columns: { type: "array", items: { type: "string" }, description: "Expected column names" },
        },
        required: ["sql", "explanation", "columns"],
      },
    },
  },
];

const NAV_TOOLS = [
  {
    type: "function",
    function: {
      name: "navigate_user",
      description: "Provide navigation guidance to the user",
      parameters: {
        type: "object",
        properties: {
          page_key: { type: "string", description: "Key for the target page (e.g. 'inventory', 'sales', 'customers')" },
          instructions: { type: "string", description: "Step-by-step instructions for the user" },
          shortcut: { type: "string", description: "Keyboard shortcut if applicable (e.g. 'Ctrl+K to search')" },
        },
        required: ["page_key", "instructions"],
      },
    },
  },
];

const VALID_CRUD_ACTIONS = [
  "create_customer", "create_product", "record_payment",
  "create_sale_draft", "update_customer", "update_product", "cancel_order",
] as const;

function buildCrudResponse(classification: any, companyId: string) {
  const { crud_action, entities, missing_fields, reply_text } = classification;
  const validatedAction = VALID_CRUD_ACTIONS.includes(crud_action) ? crud_action : null;

  if (!validatedAction) {
    return {
      reply: {
        text: reply_text || "I understood you want to modify data, but I couldn't determine the specific action. Could you be more specific?",
        cards: [{
          type: "choice" as const,
          prompt: "What would you like to do?",
          options: [
            { label: "Create a customer", value: "create_customer" },
            { label: "Create a product", value: "create_product" },
            { label: "Record a payment", value: "record_payment" },
            { label: "Create a sale", value: "create_sale_draft" },
          ],
        }],
      },
      meta: {
        intent: "clarification",
        confidence: classification.confidence,
      },
    };
  }

  const intent: any = {
    type: validatedAction,
    confidence: classification.confidence,
    data: entities || {},
    missing: missing_fields || [],
  };

  const cards: any[] = [];

  if (missing_fields && missing_fields.length > 0) {
    cards.push({
      type: "choice",
      prompt: `I need a few more details: ${missing_fields.join(", ")}. Please provide:`,
      options: missing_fields.map((f: string) => ({ label: `Provide ${f}`, value: f })),
    });
  }

  return {
    reply: {
      text: reply_text || `I'll help you ${crud_action?.replace(/_/g, " ")}. ${missing_fields?.length ? `But I need: ${missing_fields.join(", ")}` : "Here's what I'll do:"}`,
      cards,
      draft: missing_fields?.length ? undefined : { intent, channel: "chat", originalText: "" },
    },
    meta: {
      intent: "crud_action",
      confidence: classification.confidence,
      crud_action,
    },
  };
}

function buildNavigationResponse(navResult: any) {
  const pageKey = navResult.page_key?.toLowerCase() || "";
  const page = PAGE_MAP[pageKey] || PAGE_MAP[pageKey.replace(/s$/, "")] || null;

  const cards: any[] = [];
  if (page) {
    cards.push({
      type: "link",
      label: page.label,
      path: page.path,
      description: navResult.instructions || `Go to ${page.label}`,
    });
  }

  return {
    reply: {
      text: navResult.instructions || "I can help you navigate the app. What are you looking for?",
      cards,
      suggestions: ["Show me all pages", "How to create a sale?", "Where are my settings?"],
      navigation: page ? { path: page.path, label: page.label } : undefined,
    },
    meta: {
      intent: "navigation_help",
      confidence: 0.9,
    },
  };
}

async function buildQueryResponse(
  classification: any,
  supabase: any,
  companyId: string,
  userRole: string,
  apiKey: string,
  systemPrompt: string,
  userId: string,
) {
  const maxRows = getMaxRows(userRole);

  const sqlPrompt = `Based on the classified intent, generate a SQL query.

Intent classification: ${JSON.stringify(classification)}
User role: ${userRole}
Max rows: ${maxRows}
Company ID: ${companyId}

Generate a safe, read-only SQL SELECT query. Always filter by company_id = '${companyId}'. Add LIMIT ${maxRows}.`;

  let aiResult: any;
  try {
    aiResult = await callLLM(apiKey, systemPrompt, sqlPrompt, SQL_TOOLS, {
      type: "function",
      function: { name: "generate_sql" },
    });
  } catch (e) {
    return {
      reply: {
        text: "I had trouble generating the query. Please try rephrasing your question.",
      },
      meta: {
        intent: "data_query",
        confidence: classification.confidence,
      },
    };
  }

  const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    return {
      reply: {
        text: classification.reply_text || "I couldn't generate a query for that. Try asking differently.",
      },
      meta: { intent: "data_query", confidence: classification.confidence },
    };
  }

  const generated = JSON.parse(toolCall.function.arguments);
  const sql: string = generated.sql;

  const validation = validateSQL(sql);
  if (!validation.valid) {
    return {
      reply: {
        text: `I generated a query but it didn't pass security validation: ${validation.error}. Please try rephrasing.`,
      },
      meta: { intent: "data_query", confidence: classification.confidence, sql },
    };
  }

  if (!sql.includes(companyId)) {
    return {
      reply: {
        text: "I couldn't generate a properly filtered query. Please try rephrasing your question.",
      },
      meta: { intent: "data_query", confidence: classification.confidence },
    };
  }

  const startTime = Date.now();
  let data: any[] | null = null;
  let execError: any = null;

  try {
    const queryPromise = supabase.rpc("execute_readonly_query", {
      query_sql: sql,
      max_rows: maxRows,
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Query timeout")), 30000)
    );
    const result = await Promise.race([queryPromise, timeoutPromise]) as any;
    data = result.data;
    execError = result.error;
  } catch (e) {
    execError = e;
  }

  if (execError || !data) {
    return {
      reply: {
        text: `I ran the query but encountered an error. ${execError?.message || "No data returned."}. Try a simpler question.`,
      },
      meta: {
        intent: "data_query",
        confidence: classification.confidence,
        sql,
        execution_time_ms: Date.now() - startTime,
      },
    };
  }

  const columns = generated.columns?.length > 0
    ? generated.columns
    : data.length > 0 ? Object.keys(data[0]) : [];
  const executionTime = Date.now() - startTime;

  const cards: any[] = [];
  if (data.length > 0) {
    cards.push({
      type: "table",
      columns,
      rows: data.slice(0, 20),
      total_rows: data.length,
    });
  }

  try {
    await supabase.from("query_history").insert({
      user_id: userId,
      company_id: companyId,
      query_text: classification.reply_text || "AI Assistant query",
      query_type: "assistant_query",
      generated_sql: sql,
      execution_time_ms: executionTime,
      row_count: data.length,
    });
  } catch {}

  const summaryStats: Record<string, { min: number; max: number; avg: number; sum: number }> = {};
  if (data.length > 0) {
    for (const col of columns) {
      const sample = data.find((r: any) => r[col] !== null)?.[col];
      if (typeof sample === "number") {
        const values = data.map((r: any) => r[col]).filter((v: any) => v !== null && typeof v === "number") as number[];
        if (values.length > 0) {
          const sum = values.reduce((a: number, b: number) => a + b, 0);
          summaryStats[col] = {
            min: values.reduce((a: number, b: number) => a < b ? a : b, values[0]),
            max: values.reduce((a: number, b: number) => a > b ? a : b, values[0]),
            avg: sum / values.length,
            sum,
          };
        }
      }
    }
  }

  const hasStats = Object.keys(summaryStats).length > 0;
  const statsNarrative = hasStats
    ? Object.entries(summaryStats)
        .slice(0, 3)
        .map(([col, s]) => `${col}: total ${s.sum.toLocaleString()}, avg ${s.avg.toFixed(2)}`)
        .join("; ")
    : "";

  const rowCountText = data.length === 0
    ? "No data found for your query."
    : `Found ${data.length} row${data.length > 20 ? "s (showing first 20)" : ""}.`;

  return {
    reply: {
      text: `${generated.explanation || classification.reply_text}\n\n${rowCountText}${statsNarrative ? `\n${statsNarrative}` : ""}`,
      cards,
      suggestions: [
        "Show more details",
        "Export as CSV",
        "Compare with last period",
      ],
    },
    meta: {
      intent: "data_query",
      confidence: classification.confidence,
      sql,
      execution_time_ms: executionTime,
      row_count: data.length,
    },
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

async function buildInsightResponse(
  supabase: any,
  companyId: string,
  userRole: string,
) {
  if (!isValidUUID(companyId)) {
    return {
      reply: { text: "Invalid company context. Please refresh the page." },
      meta: { intent: "insight_request", confidence: 0 },
    };
  }
  const cid = companyId.replace(/'/g, "''");
  const insights: any[] = [];

  const [lowStock, overdue, expiry, salesTrend] = await Promise.all([
    supabase.rpc("execute_readonly_query", {
      query_sql: `SELECT p.name, p.manufacturer, SUM(ib.quantity * COALESCE(ib.pack_size, 1) + COALESCE(ib.loose_quantity, 0)) as stock FROM products p LEFT JOIN inventory_batches ib ON p.id = ib.product_id WHERE p.company_id = '${cid}' AND p.is_active = true GROUP BY p.id, p.name, p.manufacturer HAVING SUM(ib.quantity * COALESCE(ib.pack_size, 1) + COALESCE(ib.loose_quantity, 0)) < 10 ORDER BY stock ASC LIMIT 5`,
      max_rows: 5,
    }).catch(() => ({ data: [] })),
    supabase.rpc("execute_readonly_query", {
      query_sql: `SELECT customer_name, total_amount, invoice_number FROM sales_orders WHERE company_id = '${cid}' AND payment_status = 'unpaid' AND status != 'cancelled' AND created_at < NOW() - INTERVAL '30 days' ORDER BY created_at ASC LIMIT 5`,
      max_rows: 5,
    }).catch(() => ({ data: [] })),
    supabase.rpc("execute_readonly_query", {
      query_sql: `SELECT ib.batch_number, p.name as product_name, ib.expiry_date, ib.quantity FROM inventory_batches ib JOIN products p ON ib.product_id = p.id WHERE ib.company_id = '${cid}' AND ib.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' AND ib.quantity > 0 ORDER BY ib.expiry_date ASC LIMIT 5`,
      max_rows: 5,
    }).catch(() => ({ data: [] })),
    supabase.rpc("execute_readonly_query", {
      query_sql: `SELECT DATE_TRUNC('week', created_at) as week, SUM(total_amount) as revenue FROM sales_orders WHERE company_id = '${cid}' AND status != 'cancelled' AND created_at > NOW() - INTERVAL '28 days' GROUP BY 1 ORDER BY 1 DESC LIMIT 4`,
      max_rows: 4,
    }).catch(() => ({ data: [] })),
  ]);

  if (lowStock.data?.length > 0) {
    insights.push({
      type: "insight",
      title: `${lowStock.data.length} products low on stock`,
      body: lowStock.data.map((r: any) => `${r.name}: ${r.stock} units`).join(", "),
      severity: "warning" as const,
    });
  }

  if (overdue.data?.length > 0) {
    insights.push({
      type: "insight",
      title: `${overdue.data.length} overdue payments`,
      body: overdue.data.map((r: any) => `${r.customer_name}: Rs ${r.total_amount} (${r.invoice_number})`).join(", "),
      severity: "critical" as const,
    });
  }

  if (expiry.data?.length > 0) {
    insights.push({
      type: "insight",
      title: `${expiry.data.length} batches expiring within 30 days`,
      body: expiry.data.map((r: any) => `${r.product_name} (${r.batch_number}): ${r.expiry_date}`).join(", "),
      severity: "warning" as const,
    });
  }

  if (salesTrend.data?.length >= 2) {
    const weeks = salesTrend.data;
    const latest = Number(weeks[0]?.revenue) || 0;
    const prev = Number(weeks[1]?.revenue) || 0;
    const change = prev > 0 ? ((latest - prev) / prev * 100).toFixed(0) : "N/A";
    insights.push({
      type: "insight",
      title: `Sales ${Number(change) >= 0 ? "up" : "down"} ${Math.abs(Number(change))}% this week`,
      body: `This week: Rs ${latest.toLocaleString()}, Last week: Rs ${prev.toLocaleString()}`,
      severity: Number(change) < -10 ? "warning" as const : "info" as const,
    });
  }

  const summary = insights.length === 0
    ? "Everything looks good! No urgent items to flag."
    : insights.map((i) => `${i.title}`).join("\n");

  return {
    reply: {
      text: `Here's your business health summary:\n\n${summary}`,
      cards: insights,
      suggestions: ["Show overdue payments", "Low stock details", "Expiring batches list"],
    },
    meta: {
      intent: "insight_request",
      confidence: 0.95,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          conversation_id: "",
          reply: { text: "Authentication required." },
          meta: { intent: "unknown", confidence: 0 },
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          conversation_id: "",
          reply: { text: "Invalid or expired session." },
          meta: { intent: "unknown", confidence: 0 },
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const request: AIAssistantRequest = await req.json();
    const { message, conversation_id, company_id, user_role, business_type } = request;

    if (!message || !company_id) {
      return new Response(
        JSON.stringify({
          conversation_id: conversation_id || "",
          reply: { text: "Please provide a message and company context." },
          meta: { intent: "unknown", confidence: 0 },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    if (!isSuperAdmin && profile?.company_id !== company_id) {
      return new Response(
        JSON.stringify({
          conversation_id,
          reply: { text: "You don't have access to this company." },
          meta: { intent: "unknown", confidence: 0 },
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = buildSystemPrompt(request);

    let classificationResult: any;
    try {
      const llmResult = await callLLM(LOVABLE_API_KEY, systemPrompt, message, INTENT_TOOLS, {
        type: "function",
        function: { name: "classify_intent" },
      });

      const toolCall = llmResult.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No tool call returned");
      classificationResult = JSON.parse(toolCall.function.arguments);
    } catch (llmError: any) {
      const errorMsg = String(llmError?.message || llmError);
      if (errorMsg.includes("RATE_LIMITED")) {
        return new Response(
          JSON.stringify({
            conversation_id,
            reply: { text: "I'm getting too many requests. Please try again in a moment." },
            meta: { intent: "unknown", confidence: 0 },
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (errorMsg.includes("CREDITS_EXHAUSTED")) {
        return new Response(
          JSON.stringify({
            conversation_id,
            reply: { text: "AI credits exhausted. Please contact your administrator." },
            meta: { intent: "unknown", confidence: 0 },
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          conversation_id,
          reply: {
            text: "I'm having trouble processing your request right now. Please try again.",
            suggestions: ["Add customer", "Add product", "Record payment"],
          },
          meta: { intent: "unknown", confidence: 0 },
          fallback_used: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { intent, confidence } = classificationResult;
    let response: any;

    switch (intent) {
      case "crud_action": {
        response = buildCrudResponse(classificationResult, company_id);
        break;
      }
      case "data_query": {
        response = await buildQueryResponse(
          classificationResult, supabase, company_id, user_role,
          LOVABLE_API_KEY, systemPrompt, user.id,
        );
        break;
      }
      case "insight_request": {
        response = await buildInsightResponse(supabase, company_id, user_role);
        break;
      }
      case "navigation_help": {
        let navResult: any;
        try {
          const navLLM = await callLLM(LOVABLE_API_KEY, systemPrompt, message, NAV_TOOLS, {
            type: "function",
            function: { name: "navigate_user" },
          });
          const navCall = navLLM.choices?.[0]?.message?.tool_calls?.[0];
          navResult = navCall ? JSON.parse(navCall.function.arguments) : {};
        } catch {
          navResult = {};
        }
        response = buildNavigationResponse(navResult);
        break;
      }
      case "clarification": {
        response = {
          reply: {
            text: classificationResult.reply_text || "I'm not sure what you mean. Could you clarify?",
            cards: classificationResult.entities?.options
              ? [{ type: "choice", prompt: "Did you mean:", options: classificationResult.entities.options }]
              : [],
            suggestions: ["Create a customer", "Query my data", "Business health check"],
          },
          meta: { intent: "clarification", confidence },
        };
        break;
      }
      default: {
        response = {
          reply: {
            text: classificationResult.reply_text || "I can help you manage your ERP. Try asking me to create records, query data, or check business insights.",
            suggestions: ["Add customer", "Show sales this month", "How's business doing?"],
          },
          meta: { intent: "unknown", confidence },
        };
        break;
      }
    }

    return new Response(
      JSON.stringify({
        conversation_id,
        ...response,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(
      JSON.stringify({
        conversation_id: "",
        reply: { text: "Something went wrong. Please try again." },
        meta: { intent: "unknown", confidence: 0, error: e instanceof Error ? e.message : "Unknown error" },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
