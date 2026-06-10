import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_CRUD_ACTIONS = [
  "create_customer", "create_product", "record_payment",
  "create_sale_draft", "update_customer", "update_product", "cancel_order",
] as const;

const PAGE_MAP: Record<string, { path: string; label: string }> = {
  query: { path: "/query", label: "Query Engine" },
  reports: { path: "/reports", label: "Reports" },
  inventory: { path: "/inventory", label: "Inventory" },
  batches: { path: "/inventory", label: "Inventory (Batches)" },
  sales: { path: "/sales", label: "Sales" },
  customers: { path: "/customers", label: "Customers" },
  products: { path: "/products", label: "Products" },
  payments: { path: "/accounts", label: "Accounts" },
  accounts: { path: "/accounts", label: "Accounts" },
  settings: { path: "/settings", label: "Settings" },
};

interface AIAssistantRequest {
  message: string;
  conversation_id: string;
  history: { id: string; role: string; text: string; meta?: { intent?: string; confidence?: number } }[];
  company_id: string;
  user_role: string;
  business_type: string;
}

function buildHistoryText(history: { role: string; text: string }[]): string {
  const recent = history.slice(-10);
  return recent.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n");
}

function buildSystemPrompt(): string {
  return `You are an ERP Automation Assistant. Parse free-text commands into structured CRUD actions.

SUPPORTED ACTIONS (all require confirmation before execution):
- create_customer: name, phone (optional: email, gst_number, address)
- create_product: name, manufacturer, mrp, purchase_price (optional: sale_price, gst_percentage, unit)
- record_payment: party_name, amount, payment_method (optional: notes)
- create_sale_draft: customer_name or customer_phone, items (name + quantity + optional rate + gst)
- update_customer: customer name/id, fields to update
- update_product: product name/id, fields to update
- cancel_order: invoice_number

RULES:
1. Extract ALL available fields from the text. If required fields are missing, list them in missing_fields.
2. For create_sale_draft, always also extract customer_phone if present, and doctor_name/prescription_number if present.
3. If the user asks to query data, generate reports, or view analytics, classify as "redirect_to_query" and suggest /query page.
4. If the user asks about business health, stock levels, or trends, classify as "redirect_to_query".
5. If the intent is unclear, ask a clarifying question.
6. Always respond in a single sentence describing what you understood.

Respond using the classify_intent tool only.`;
}

async function callLLM(apiKey: string, systemPrompt: string, userMessage: string): Promise<any> {
  const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "accounts/fireworks/models/qwen3p6-plus",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "classify_intent",
            description: "Classify the user's command into a CRUD action",
            parameters: {
              type: "object",
              properties: {
                intent: {
                  type: "string",
                  enum: ["crud_action", "redirect_to_query", "navigation_help", "clarification", "unknown"],
                },
                crud_action: {
                  type: "string",
                  enum: ["create_customer", "create_product", "record_payment", "create_sale_draft", "update_customer", "update_product", "cancel_order"],
                },
                confidence: { type: "number" },
                entities: { type: "object" },
                missing_fields: { type: "array", items: { type: "string" } },
                reply_text: { type: "string" },
              },
              required: ["intent", "confidence", "reply_text"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "classify_intent" } },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("RATE_LIMITED");
    if (response.status === 402) throw new Error("CREDITS_EXHAUSTED");
    throw new Error(`AI_CALL_FAILED:${response.status}`);
  }

  const result = await response.json();
  return result;
}

function buildCrudResponse(classification: any) {
  const { crud_action, entities, missing_fields, reply_text, confidence } = classification;
  const validatedAction = VALID_CRUD_ACTIONS.includes(crud_action) ? crud_action : null;

  if (!validatedAction) {
    return {
      reply: {
        text: reply_text || "I couldn't determine a valid action. Try: 'Add customer ABC phone 9876543210'.",
      },
      meta: { intent: "unknown", confidence: confidence || 0 },
    };
  }

  const intentData = {
    type: validatedAction,
    confidence: confidence || 0.8,
    data: entities || {},
    missing: missing_fields || [],
  };

  return {
    reply: {
      text: reply_text || `Understood: ${validatedAction.replace(/_/g, " ")}. ${missing_fields?.length ? `Need: ${missing_fields.join(", ")}.` : "I'll create a draft for your review."}`,
      draft: missing_fields?.length ? undefined : { intent: intentData, channel: "chat" as const, originalText: "" },
    },
    meta: { intent: "crud_action", confidence: confidence || 0.8, crud_action: validatedAction },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIREWORKS_API_KEY = Deno.env.get("FIREWORKS_API_KEY");
    if (!FIREWORKS_API_KEY) throw new Error("FIREWORKS_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ conversation_id: "", reply: { text: "Authentication required." }, meta: { intent: "unknown", confidence: 0 } }),
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
        JSON.stringify({ conversation_id: "", reply: { text: "Invalid or expired session." }, meta: { intent: "unknown", confidence: 0 } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: AIAssistantRequest = await req.json();
    const { message, conversation_id, company_id } = body;

    if (!message || !company_id) {
      return new Response(
        JSON.stringify({ conversation_id: conversation_id || "", reply: { text: "Message and company context required." }, meta: { intent: "unknown", confidence: 0 } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    if (!isSuperAdmin && profile?.company_id !== company_id) {
      return new Response(
        JSON.stringify({ conversation_id, reply: { text: "You don't have access to this company." }, meta: { intent: "unknown", confidence: 0 } }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const historyText = buildHistoryText(body.history || []);
    const systemPrompt = buildSystemPrompt() + (historyText ? `\n\nConversation history:\n${historyText}` : "");

    let classification: any;
    try {
      const llmResult = await callLLM(FIREWORKS_API_KEY, systemPrompt, message);
      const toolCall = llmResult.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No tool call returned");
      classification = JSON.parse(toolCall.function.arguments);
    } catch (e: any) {
      const errMsg = String(e?.message || e);
      if (errMsg.includes("RATE_LIMITED")) {
        return new Response(JSON.stringify({ conversation_id, reply: { text: "Too many requests. Please try again shortly." }, meta: { intent: "unknown", confidence: 0 } }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (errMsg.includes("CREDITS_EXHAUSTED")) {
        return new Response(JSON.stringify({ conversation_id, reply: { text: "AI credits exhausted. Contact your administrator." }, meta: { intent: "unknown", confidence: 0 } }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ conversation_id, reply: { text: "I had trouble processing that. Try a simpler command like 'Add customer ABC phone 9876543210'." }, meta: { intent: "unknown", confidence: 0 }, fallback_used: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { intent } = classification;
    let response: any;

    switch (intent) {
      case "crud_action":
        response = buildCrudResponse(classification);
        break;
      case "redirect_to_query":
        response = {
          reply: {
            text: classification.reply_text || "For data queries and reports, please use the Query Engine page at /query. I handle automation commands like creating records and payments.",
          },
          meta: { intent: "redirect_to_query", confidence: classification.confidence || 0.9 },
        };
        break;
      case "navigation_help":
        response = {
          reply: {
            text: "I can help navigate the app. For data queries and reports, go to the Query Engine at /query. For automation, I'm right here!",
          },
          meta: { intent: "navigation_help", confidence: classification.confidence || 0.8 },
        };
        break;
      case "clarification":
        response = {
          reply: { text: classification.reply_text || "Could you be more specific? Example: 'Add customer Raj Traders phone 9876543210'" },
          meta: { intent: "clarification", confidence: classification.confidence || 0.5 },
        };
        break;
      default:
        response = {
          reply: { text: classification.reply_text || "I handle automation commands: create customers, products, record payments, and create sales drafts. Try: 'Add customer ABC phone 9876543210'" },
          meta: { intent: "unknown", confidence: classification.confidence || 0.1 },
        };
        break;
    }

    return new Response(
      JSON.stringify({ conversation_id, ...response }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(
      JSON.stringify({ conversation_id: "", reply: { text: "Something went wrong. Please try again." }, meta: { intent: "unknown", confidence: 0 } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});