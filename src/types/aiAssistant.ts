import type { AppRole } from "@/contexts/AuthContext";
import type { AutomationDraft, AutomationIntent } from "@/services/chatAutomation";

export type AssistantIntentType =
  | "crud_action"
  | "data_query"
  | "insight_request"
  | "navigation_help"
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
  cards?: AssistantCard[];
  draft?: AutomationDraft;
  meta?: AssistantMeta;
  timestamp: string;
}

export type AssistantCard =
  | { type: "table"; columns: string[]; rows: Record<string, unknown>[]; total_rows: number }
  | { type: "chart"; chart_type: "bar" | "line" | "pie"; config: Record<string, unknown> }
  | { type: "insight"; title: string; body: string; severity: "info" | "warning" | "critical" }
  | { type: "link"; label: string; path: string; description: string }
  | { type: "choice"; prompt: string; options: Array<{ label: string; value: string }> };

export interface AssistantMeta {
  intent: AssistantIntentType;
  confidence: number;
  sql?: string;
  execution_time_ms?: number;
  row_count?: number;
  crud_action?: CrudActionType;
}

export interface AssistantReply {
  text: string;
  cards?: AssistantCard[];
  draft?: AutomationDraft;
  suggestions?: string[];
  navigation?: { path: string; label: string };
}

export interface AIAssistantRequest {
  message: string;
  conversation_id: string;
  history: ConversationMessage[];
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

export interface ProactiveInsight {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  category: "low_stock" | "overdue_payments" | "expiry_warning" | "sales_trend";
  action?: { label: string; path: string };
}

export interface ProactiveInsightsResponse {
  insights: ProactiveInsight[];
  generated_at: string;
}

export const MAX_CONVERSATION_HISTORY = 20;

export const HINT_CHIP_PRESETS: Record<string, string[]> = {
  pharmacy: [
    "Low stock items?",
    "Expiring batches this month?",
    "Overdue payments?",
    "Top sellers this week",
  ],
  pharmacy_b2b: [
    "Overdue payments?",
    "Sales this month",
    "Low stock items?",
    "Top customers by revenue",
  ],
  b2b_electronics: [
    "Sales this month",
    "Overdue invoices?",
    "Top products by revenue",
    "Inventory value",
  ],
  general_trading: [
    "Sales summary",
    "Overdue payments?",
    "Low stock items?",
    "Revenue this quarter",
  ],
};
