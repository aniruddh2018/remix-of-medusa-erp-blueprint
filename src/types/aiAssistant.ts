import type { AppRole } from "@/contexts/AuthContext";
import type { AutomationDraft, AutomationIntent } from "@/services/chatAutomation";

export type AssistantIntentType =
  | "crud_action"
  | "navigation_help"
  | "redirect_to_query"
  | "clarification"
  | "unknown";

export type CrudActionType =
  | "create_customer"
  | "create_product"
  | "record_payment"
  | "create_sale_draft"
  | "update_customer"
  | "update_product"
  | "cancel_order";

export interface IntentClassification {
  intent: AssistantIntentType;
  crud_action?: CrudActionType;
  confidence: number;
  entities: Record<string, unknown>;
  missing_fields?: string[];
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: {
    intent?: string;
    confidence?: number;
  };
  draft?: AutomationDraft;
  timestamp: string;
}

export interface AssistantMeta {
  intent: AssistantIntentType;
  confidence: number;
  crud_action?: CrudActionType;
}

export interface AssistantReply {
  text: string;
  draft?: {
    intent: AutomationDraft["intent"];
    channel: "chat";
    originalText: string;
  };
}

export interface AIAssistantRequest {
  message: string;
  conversation_id: string;
  history: Pick<ConversationMessage, "id" | "role" | "text" | "meta">[];
  company_id: string;
  user_role: AppRole;
  business_type: string;
}

export interface AIAssistantResponse {
  conversation_id: string;
  reply: AssistantReply;
  meta: AssistantMeta;
  fallback_used?: boolean;
}