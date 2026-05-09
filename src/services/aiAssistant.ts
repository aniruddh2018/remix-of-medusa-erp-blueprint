import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  AIAssistantRequest,
  AIAssistantResponse,
  ConversationMessage,
  ProactiveInsight,
  ProactiveInsightsResponse,
  MAX_CONVERSATION_HISTORY,
} from "@/types/aiAssistant";
import { MAX_CONVERSATION_HISTORY as MAX_HISTORY } from "@/types/aiAssistant";

export async function callAIAssistant(
  supabase: SupabaseClient<Database>,
  params: {
    message: string;
    companyId: string;
    userRole: string;
    businessType: string;
    history: ConversationMessage[];
    conversationId?: string;
  }
): Promise<AIAssistantResponse> {
  const conversationId = params.conversationId || crypto.randomUUID();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return {
      conversation_id: conversationId,
      reply: { text: "Please log in to use the AI assistant." },
      meta: { intent: "unknown", confidence: 0 },
    };
  }

  const trimmedHistory = params.history.slice(-MAX_HISTORY);

  const request: AIAssistantRequest = {
    message: params.message,
    conversation_id: conversationId,
    history: trimmedHistory.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      meta: m.meta ? { intent: m.meta.intent, confidence: m.meta.confidence } : undefined,
    })),
    company_id: params.companyId,
    user_role: params.userRole,
    business_type: params.businessType,
  };

  const { data, error } = await supabase.functions.invoke("ai-assistant", {
    body: request,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    const errMsg = error.message || String(error);
    if (errMsg.includes("429")) {
      return {
        conversation_id: conversationId,
        reply: {
          text: "I'm getting too many requests right now. Please wait a moment and try again.",
          suggestions: ["Try again in 30 seconds"],
        },
        meta: { intent: "unknown", confidence: 0 },
        fallback_used: true,
      };
    }
    if (errMsg.includes("402")) {
      return {
        conversation_id: conversationId,
        reply: {
          text: "AI credits have been exhausted. Please contact your administrator.",
        },
        meta: { intent: "unknown", confidence: 0 },
        fallback_used: true,
      };
    }
    return {
      conversation_id: conversationId,
      reply: {
        text: "I encountered an error. Please try again.",
        suggestions: ["Try again", "Use the Query Engine page instead"],
      },
      meta: { intent: "unknown", confidence: 0 },
      fallback_used: true,
    };
  }

  return data as AIAssistantResponse;
}

export async function getProactiveInsights(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<ProactiveInsight[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token || !companyId) return [];

  try {
    const insights: ProactiveInsight[] = [];

    const [lowStock, overdue, expiry] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, manufacturer")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .limit(100),
      supabase
        .from("sales_orders")
        .select("id, customer_name, total_amount, invoice_number, created_at")
        .eq("company_id", companyId)
        .eq("payment_status", "unpaid")
        .neq("status", "cancelled")
        .lt("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .limit(5),
      supabase
        .from("inventory_batches")
        .select("id, batch_number, expiry_date, quantity, product_id")
        .eq("company_id", companyId)
        .gt("quantity", 0)
        .gt("expiry_date", new Date().toISOString().split("T")[0])
        .lt("expiry_date", new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0])
        .limit(5),
    ]);

    if (overdue.data && overdue.data.length > 0) {
      insights.push({
        id: crypto.randomUUID(),
        title: `${overdue.data.length} overdue payment${overdue.data.length > 1 ? "s" : ""}`,
        body: overdue.data
          .map((r) => `${r.customer_name}: Rs ${r.total_amount}`)
          .join(", "),
        severity: "critical",
        category: "overdue_payments",
        action: { label: "View overdue", path: "/accounts" },
      });
    }

    if (expiry.data && expiry.data.length > 0) {
      insights.push({
        id: crypto.randomUUID(),
        title: `${expiry.data.length} batch${expiry.data.length > 1 ? "es" : ""} expiring within 30 days`,
        body: expiry.data
          .map((r) => `Batch ${r.batch_number}: ${r.expiry_date}`)
          .join(", "),
        severity: "warning",
        category: "expiry_warning",
        action: { label: "View expiry", path: "/expiry" },
      });
    }

    if (lowStock.data && lowStock.data.length > 0) {
      insights.push({
        id: crypto.randomUUID(),
        title: "Check inventory levels",
        body: `${lowStock.data.length} products in catalog. Verify stock levels.`,
        severity: "info",
        category: "low_stock",
        action: { label: "View inventory", path: "/inventory" },
      });
    }

    return insights;
  } catch {
    return [];
  }
}

export function buildConversationMessage(
  role: ConversationMessage["role"],
  text: string,
  meta?: ConversationMessage["meta"],
  cards?: ConversationMessage["cards"],
  draft?: ConversationMessage["draft"],
): ConversationMessage {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    cards,
    draft,
    meta,
    timestamp: new Date().toISOString(),
  };
}

export function trimHistory(history: ConversationMessage[]): ConversationMessage[] {
  return history.slice(-MAX_HISTORY);
}
