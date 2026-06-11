import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Security configuration
const FORBIDDEN_KEYWORDS = [
  "DELETE",
  "UPDATE",
  "INSERT",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "EXECUTE",
  "CALL",
  "COPY",
  "VACUUM",
  "ANALYZE",
];

const FORBIDDEN_TABLES = [
  "auth.users",
  "auth.identities",
  "auth.sessions",
  "storage.objects",
  "storage.buckets",
];

const ALLOWED_TABLES = [
  "sales_orders",
  "sales_order_items",
  "customers",
  "suppliers",
  "products",
  "inventory_batches",
  "payments",
  "purchase_orders",
  "payments_sales",
  "companies",
  "audit_logs",
  "doctors",
  "sale_doctors",
  "scheduled_drugs",
  "unit_conversions",
];

const ROW_LIMITS: Record<string, number> = {
  super_admin: 100000,
  admin: 50000,
  manager: 10000,
  staff: 1000,
  accountant: 5000,
  default: 5000,
};

// Types
interface NLQueryRequest {
  query: string;
  company_id: string;
  options?: {
    max_rows?: number;
    include_analysis?: boolean;
    format?: "json" | "table" | "chart";
  };
}

interface ColumnInfo {
  name: string;
  type: string;
}

interface AnalysisResult {
  summary_stats?: Record<string, { min: number; max: number; avg: number; sum: number; count: number }>;
  row_count: number;
  column_count: number;
  execution_time_ms: number;
}

interface NLQueryResponse {
  success: boolean;
  data?: any[];
  columns?: string[];
  sql?: string;
  execution_time_ms: number;
  row_count: number;
  analysis?: AnalysisResult;
  error?: {
    type: string;
    message: string;
    suggestion?: string;
  };
}

// Get max rows based on user role
function getMaxRows(userRole: string, requestedMax?: number): number {
  const roleLimit = ROW_LIMITS[userRole] || ROW_LIMITS["default"];
  if (requestedMax && requestedMax < roleLimit) {
    return requestedMax;
  }
  return roleLimit;
}

// Validate and sanitize SQL
function validateSQL(sql: string): { valid: boolean; error?: string; sanitized?: string } {
  const upperSQL = sql.toUpperCase().trim();

  // Check for forbidden operations
  for (const keyword of FORBIDDEN_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(sql)) {
      return { valid: false, error: `Forbidden SQL operation detected: ${keyword}. Only SELECT queries are allowed.` };
    }
  }

  // Must start with SELECT
  if (!upperSQL.startsWith("SELECT")) {
    return { valid: false, error: "Query must start with SELECT. Only read-only operations are permitted." };
  }

  // Check for forbidden tables
  for (const table of FORBIDDEN_TABLES) {
    if (upperSQL.includes(table.toUpperCase())) {
      return { valid: false, error: `Access to system table '${table}' is forbidden.` };
    }
  }

  // Basic check for semicolon (prevent multiple statements)
  if (sql.includes(";")) {
    return { valid: false, error: "Multiple SQL statements are not allowed." };
  }

  return { valid: true, sanitized: sql };
}

// Generate analysis for numeric columns
function generateAnalysis(data: any[], columns: string[], executionTimeMs: number): AnalysisResult {
  const analysis: AnalysisResult = {
    row_count: data.length,
    column_count: columns.length,
    execution_time_ms: executionTimeMs,
    summary_stats: {},
  };

  if (data.length === 0) return analysis;

  // Analyze each column
  for (const col of columns) {
    // Check if column is numeric
    const sampleValue = data.find((row) => row[col] !== null)?.[col];
    if (typeof sampleValue === "number") {
      const values = data.map((row) => row[col]).filter((v) => v !== null && typeof v === "number") as number[];

      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        analysis.summary_stats![col] = {
          min: Math.min(...values),
          max: Math.max(...values),
          avg: sum / values.length,
          sum: sum,
          count: values.length,
        };
      }
    }
  }

  return analysis;
}

// Get database schema for LLM context
async function getDatabaseSchema(supabase: any, companyId: string): Promise<string> {
  const schema = [
    "## Queryable Tables:",
    "",
    "sales_orders (id, invoice_number, customer_name, customer_id, total_amount, gst_amount, discount_amount, amount_paid, due_date, status, payment_status, created_at, company_id)",
    "sales_order_items (id, sales_order_id, product_id, product_name, quantity, rate, gst_percentage, total, company_id)",
    "customers (id, name, phone, email, address, gst_number, company_id, created_at)",
    "suppliers (id, name, phone, email, address, gst_number, company_id)",
    "products (id, name, generic_name, strength, manufacturer, mrp, sale_price, purchase_price, gst_percentage, hsn_code, unit, company_id)",
    "inventory_batches (id, product_id, batch_number, expiry_date, quantity, loose_quantity, purchase_price, company_id)",
    "payments (id, amount, party_name, party_type, payment_type, payment_method, reference_id, created_at, company_id)",
    "purchase_orders (id, invoice_number, supplier_id, supplier_name, total_amount, status, created_at, company_id)",
    "payments_sales (id, sales_order_id, payment_id, amount_applied, created_at)",
    "",
    `## IMPORTANT RULES:`,
    `1. ALWAYS include: WHERE company_id = '${companyId}'`,
    `2. Use table aliases for readability`,
    `3. For dates, use ISO format: '2026-01-01'`,
    `4. For aggregations, use GROUP BY with all non-aggregated columns`,
    `5. Add LIMIT clause to limit results`,
    `6. Use meaningful column aliases`,
    `7. Join tables using foreign keys when needed`,
    `8. Outstanding balance on a sales_order = (total_amount - COALESCE(amount_paid, 0)). There is NO crm_total_amount, outstanding_amount, or balance column — always compute it.`,
    `9. Only use columns listed above. Never invent column names.`,
  ].join("\n");


  return schema;
}

// Main handler
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Get environment variables
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          execution_time_ms: Date.now() - startTime,
          row_count: 0,
          error: { type: "UNAUTHORIZED", message: "No authorization header provided" },
        } as NLQueryResponse),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(supabaseUrl, anonKey);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          execution_time_ms: Date.now() - startTime,
          row_count: 0,
          error: { type: "UNAUTHORIZED", message: "Invalid or expired token" },
        } as NLQueryResponse),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: NLQueryRequest = await req.json();
    const { query, company_id, options } = body;

    if (!query || !company_id) {
      return new Response(
        JSON.stringify({
          success: false,
          execution_time_ms: Date.now() - startTime,
          row_count: 0,
          error: { type: "INVALID_REQUEST", message: "query and company_id are required" },
        } as NLQueryResponse),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify company membership and get role
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup error:", profileError);
      return new Response(
        JSON.stringify({
          success: false,
          execution_time_ms: Date.now() - startTime,
          row_count: 0,
          error: { type: "PROFILE_ERROR", message: "Failed to verify user profile" },
        } as NLQueryResponse),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if super admin
    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { _user_id: user.id });

    // Verify company access
    if (!isSuperAdmin && profile?.company_id !== company_id) {
      return new Response(
        JSON.stringify({
          success: false,
          execution_time_ms: Date.now() - startTime,
          row_count: 0,
          error: { type: "FORBIDDEN", message: "You do not have access to this company" },
        } as NLQueryResponse),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roleRow } = await supabase
      .from("user_companies")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", company_id)
      .maybeSingle();
    const userRole = (roleRow?.role as string) || (isSuperAdmin ? "super_admin" : "default");
    const maxRows = getMaxRows(userRole, options?.max_rows);

    // Get database schema for context
    const schema = await getDatabaseSchema(supabase, company_id);

    // Call LLM to generate SQL
    const systemPrompt = `You are an expert SQL query generator for an ERP system. Convert natural language queries into safe, optimized PostgreSQL SELECT statements.

${schema}

## RESPONSE FORMAT:
You MUST use the generate_sql function with these parameters:
- sql: The complete, valid PostgreSQL SELECT query
- intent: Brief description (1 sentence) of what the query does
- explanation: User-friendly explanation of the query
- columns: Array of column names that will be returned

## EXAMPLES:

User: "Show me total sales this month"
SQL: SELECT COUNT(*) as total_orders, SUM(total_amount) as total_revenue FROM sales_orders WHERE company_id = '${company_id}' AND created_at >= DATE_TRUNC('month', CURRENT_DATE) AND status = 'confirmed' LIMIT ${maxRows}

User: "Top 5 customers by sales"
SQL: SELECT c.name, c.phone, COUNT(so.id) as order_count, SUM(so.total_amount) as total_spent FROM customers c JOIN sales_orders so ON c.id = so.customer_id WHERE so.company_id = '${company_id}' GROUP BY c.id, c.name, c.phone ORDER BY total_spent DESC LIMIT 5

User: "Products low in stock"
SQL: SELECT p.name, p.manufacturer, SUM(ib.quantity * COALESCE(ib.pack_size, 1) + COALESCE(ib.loose_quantity, 0)) as stock_quantity FROM products p LEFT JOIN inventory_batches ib ON p.id = ib.product_id WHERE p.company_id = '${company_id}' GROUP BY p.id, p.name, p.manufacturer HAVING SUM(ib.quantity * COALESCE(ib.pack_size, 1) + COALESCE(ib.loose_quantity, 0)) < 10 ORDER BY stock_quantity ASC LIMIT ${maxRows}

Remember: Always filter by company_id = '${company_id}' and add LIMIT ${maxRows}`;

    const llmStartTime = Date.now();
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
          { role: "user", content: query },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_sql",
              description: "Generate a SQL query from natural language",
              parameters: {
                type: "object",
                properties: {
                  sql: {
                    type: "string",
                    description: "The complete PostgreSQL SELECT query",
                  },
                  intent: {
                    type: "string",
                    description: "Brief description of what the query does",
                  },
                  explanation: {
                    type: "string",
                    description: "User-friendly explanation of the query",
                  },
                  columns: {
                    type: "array",
                    items: { type: "string" },
                    description: "Column names that will be returned",
                  },
                },
                required: ["sql", "intent", "explanation", "columns"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_sql" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            success: false,
            execution_time_ms: Date.now() - startTime,
            row_count: 0,
            error: {
              type: "RATE_LIMITED",
              message: "AI rate limit exceeded. Please try again in a moment.",
              suggestion: "Wait 30 seconds and retry",
            },
          } as NLQueryResponse),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            success: false,
            execution_time_ms: Date.now() - startTime,
            row_count: 0,
            error: {
              type: "CREDITS_EXHAUSTED",
              message: "AI credits exhausted. Please contact your administrator.",
              suggestion: "Contact support to add more AI credits",
            },
          } as NLQueryResponse),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI generation failed: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(
        JSON.stringify({
          success: false,
          execution_time_ms: Date.now() - startTime,
          row_count: 0,
          error: {
            type: "GENERATION_FAILED",
            message: "AI failed to generate a valid SQL query",
            suggestion: "Try rephrasing your question with more specific details",
          },
        } as NLQueryResponse),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const generated = JSON.parse(toolCall.function.arguments);
    const generatedSQL: string = generated.sql;
    const generatedColumns: string[] = generated.columns || [];

    // Validate the generated SQL
    const validation = validateSQL(generatedSQL);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          execution_time_ms: Date.now() - startTime,
          row_count: 0,
          sql: generatedSQL,
          error: {
            type: "VALIDATION_FAILED",
            message: validation.error!,
            suggestion: "Try a different query or contact support",
          },
        } as NLQueryResponse),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Execute the query using anon client with user JWT for RLS enforcement
    let data: any[] | null = null;
    let error: any = null;

    try {
      const queryPromise = userClient.rpc("execute_readonly_query", {
        query_sql: validation.sanitized,
        max_rows: maxRows,
      });
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Query timeout")), 30000);
      });
      const result = await Promise.race([queryPromise, timeoutPromise]) as any;
      data = result.data;
      error = result.error;
    } catch (execError) {
      console.error("Query execution failed:", execError);
      return new Response(
        JSON.stringify({
          success: false,
          execution_time_ms: Date.now() - startTime,
          row_count: 0,
          sql: generatedSQL,
          error: {
            type: "EXECUTION_FAILED",
            message: execError instanceof Error ? execError.message : "Query execution failed",
            suggestion: "Try simplifying your query or contact support",
          },
        } as NLQueryResponse),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (error) {
      return new Response(
        JSON.stringify({
          success: false,
          execution_time_ms: Date.now() - startTime,
          row_count: 0,
          sql: generatedSQL,
          error: {
            type: "DATABASE_ERROR",
            message: error.message || "Database error occurred",
            suggestion: "Check your query syntax or contact support",
          },
        } as NLQueryResponse),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get actual column names from result if not provided by LLM
    const resultColumns = generatedColumns.length > 0
      ? generatedColumns
      : data && data.length > 0
        ? Object.keys(data[0])
        : [];

    // Generate analysis if requested
    let analysis: AnalysisResult | undefined;
    if (options?.include_analysis !== false && data && data.length > 0) {
      analysis = generateAnalysis(data, resultColumns, Date.now() - startTime);
    }

    // Log to query_history
    try {
      await supabase.from("query_history").insert({
        user_id: user.id,
        company_id: company_id,
        query_text: query,
        query_type: "natural_language",
        generated_sql: generatedSQL,
        execution_time_ms: Date.now() - startTime,
        row_count: data?.length || 0,
        created_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.error("Failed to log query history:", logError);
      // Non-critical error, don't fail the request
    }

    // Return successful response
    return new Response(
      JSON.stringify({
        success: true,
        data: data || [],
        columns: resultColumns,
        sql: generatedSQL,
        execution_time_ms: Date.now() - startTime,
        row_count: data?.length || 0,
        analysis,
      } as NLQueryResponse),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("nl-query error:", e);
    return new Response(
      JSON.stringify({
        success: false,
        execution_time_ms: Date.now() - startTime,
        row_count: 0,
        error: {
          type: "INTERNAL_ERROR",
          message: e instanceof Error ? e.message : "An unexpected error occurred",
          suggestion: "Please try again or contact support if the problem persists",
        },
      } as NLQueryResponse),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
