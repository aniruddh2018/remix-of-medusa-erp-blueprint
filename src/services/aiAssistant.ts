import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  AIAssistantRequest,
  AIAssistantResponse,
  ConversationMessage,
} from "@/types/aiAssistant";

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

  const request: AIAssistantRequest = {
    message: params.message,
    conversation_id: conversationId,
    history: params.history.slice(-10).map((m) => ({
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
          text: "I'm getting too many requests. Please try again in a moment.",
        },
        meta: { intent: "unknown", confidence: 0 },
        fallback_used: true,
      };
    }
    if (errMsg.includes("402")) {
      return {
        conversation_id: conversationId,
        reply: {
          text: "AI credits exhausted. Please contact your administrator.",
        },
        meta: { intent: "unknown", confidence: 0 },
        fallback_used: true,
      };
    }
    return {
      conversation_id: conversationId,
      reply: {
        text: "I'm having trouble processing that right now. Try typing a simple command like 'Add customer ABC phone 9876543210'.",
      },
      meta: { intent: "unknown", confidence: 0 },
      fallback_used: true,
    };
  }

  return data as AIAssistantResponse;
}

export function buildConversationMessage(
  role: ConversationMessage["role"],
  text: string,
  meta?: ConversationMessage["meta"],
  draft?: ConversationMessage["draft"],
): ConversationMessage {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    draft,
    meta,
    timestamp: new Date().toISOString(),
  };
}