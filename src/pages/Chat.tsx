import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bot, Check, ImagePlus, Loader2, MessageSquare, Send, Sparkles, X, Plus, AlertTriangle, TrendingUp, AlertCircle, Info, ExternalLink, Table2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  buildDraft,
  describeIntent,
  executeAutomationDraft,
  applySmartSalesSelection,
  parseAutomationText,
  resolveSalesDraftSmart,
  type AutomationAttachment,
  type AutomationDraft,
  type CustomerChoice,
  type SmartSalesResolution,
} from "@/services/chatAutomation";
import {
  callAIAssistant,
  getProactiveInsights,
  buildConversationMessage,
  trimHistory,
} from "@/services/aiAssistant";
import type {
  ConversationMessage,
  AssistantCard,
  ProactiveInsight,
  AssistantMeta,
  CrudActionType,
} from "@/types/aiAssistant";
import { HINT_CHIP_PRESETS } from "@/types/aiAssistant";

const KNOWN_CRUD_INTENTS = new Set<string>([
  "create_customer", "create_product", "record_payment",
  "create_sale_draft", "update_customer", "update_product", "cancel_order",
]);

type ChatFlow =
  | { kind: "idle" }
  | { kind: "await_mobile"; orderText: string; attachments: AutomationAttachment[] }
  | { kind: "await_customer_details"; orderText: string; mobile: string; attachments: AutomationAttachment[] };

const FALLBACK_EXAMPLES = [
  "Add customer Raj Traders phone 9876543210 gst 27ABCDE1234F1Z5 address Pune",
  "Add product Crocin 650 manufacturer GSK mrp 35 purchase 25 gst 12 unit strip",
  "Record payment from Raj Traders amount 2500 via UPI",
  "Create sale for Raj Traders item 10 Crocin 650 rate 35 gst 12",
  "Show me total sales this month",
];

function severityIcon(severity: string) {
  switch (severity) {
    case "critical": return <AlertTriangle className="h-4 w-4 text-destructive" />;
    case "warning": return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    default: return <Info className="h-4 w-4 text-blue-500" />;
  }
}

function AssistantCardRenderer({ card, onNavigate }: { card: AssistantCard; onNavigate: (path: string) => void }) {
  switch (card.type) {
    case "table":
      return (
        <div className="mt-2 rounded-md border overflow-hidden">
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  {card.columns.map((col) => (
                    <th key={col} className="px-2 py-1 text-left font-medium whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {card.rows.map((row, i) => (
                  <tr key={i} className="border-t">
                    {card.columns.map((col) => (
                      <td key={col} className="px-2 py-1 whitespace-nowrap">
                        {row[col] !== null && row[col] !== undefined ? String(row[col]) : "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {card.total_rows > 20 && (
            <div className="border-t px-2 py-1 text-[11px] text-muted-foreground">
              Showing 20 of {card.total_rows} rows
            </div>
          )}
        </div>
      );
    case "insight":
      return (
        <div className={`mt-2 rounded-md border p-3 ${
          card.severity === "critical" ? "border-destructive/50 bg-destructive/5" :
          card.severity === "warning" ? "border-yellow-500/50 bg-yellow-500/5" :
          "border-blue-500/50 bg-blue-500/5"
        }`}>
          <div className="flex items-start gap-2">
            {severityIcon(card.severity)}
            <div>
              <p className="text-sm font-medium">{card.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{card.body}</p>
            </div>
          </div>
        </div>
      );
    case "link":
      return (
        <button
          type="button"
          onClick={() => onNavigate(card.path)}
          className="mt-2 flex items-center gap-2 rounded-md border bg-accent/50 p-2 text-left text-sm hover:bg-accent transition-colors w-full"
        >
          <ExternalLink className="h-4 w-4 text-primary shrink-0" />
          <div>
            <p className="font-medium">{card.label}</p>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </div>
        </button>
      );
    case "choice":
      return (
        <div className="mt-2 rounded-md border p-3">
          <p className="text-sm font-medium mb-2">{card.prompt}</p>
          <div className="flex flex-wrap gap-2">
            {card.options.map((opt) => (
              <Badge key={opt.value} variant="outline" className="cursor-pointer hover:bg-accent px-3 py-1">
                {opt.label}
              </Badge>
            ))}
          </div>
        </div>
      );
    case "chart":
      return (
        <div className="mt-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground mb-2">Chart: {card.chart_type}</p>
          <div className="h-32 bg-muted/50 flex items-center justify-center text-xs text-muted-foreground">
            Chart rendering coming in Phase 2
          </div>
        </div>
      );
    default:
      return null;
  }
}

export default function Chat() {
  const { user, roles } = useAuth();
  const { companyId, businessType, config } = useBusiness();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [input, setInput] = useState("");
  const [prescriptionAttachment, setPrescriptionAttachment] = useState<AutomationAttachment | null>(null);
  const [pendingDraft, setPendingDraft] = useState<AutomationDraft | null>(null);
  const [smartResolution, setSmartResolution] = useState<SmartSalesResolution | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Record<number, string>>({});
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerChoice | null>(null);
  const [chatFlow, setChatFlow] = useState<ChatFlow>({ kind: "idle" });
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [conversationId, setConversationId] = useState(crypto.randomUUID());
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [proactiveInsights, setProactiveInsights] = useState<ProactiveInsight[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userRole = roles?.[0] || "staff";

  const [messages, setMessages] = useState<ConversationMessage[]>([
    buildConversationMessage(
      "assistant",
      "Hi! I'm your ERP AI Assistant. I can create records, answer data questions, check business health, and help you navigate the app. What would you like to do?",
      { intent: "unknown", confidence: 1 }
    ),
  ]);

  const canSave = !!companyId && !isSaving;

  const hintChips = useMemo(() => {
    const preset = HINT_CHIP_PRESETS[businessType] || HINT_CHIP_PRESETS["general_trading"];
    return proactiveInsights.length > 0
      ? proactiveInsights.slice(0, 2).map((i) => i.title.replace(/[?]?$/, "?"))
      : preset.slice(0, 4);
  }, [businessType, proactiveInsights]);

  const pendingSummary = useMemo(() => {
    return pendingDraft ? describeIntent(pendingDraft.intent) : "";
  }, [pendingDraft]);

  const clearPrescriptionAttachment = () => {
    if (prescriptionAttachment?.previewUrl) URL.revokeObjectURL(prescriptionAttachment.previewUrl);
    setPrescriptionAttachment(null);
  };

  const pushMessages = useCallback((...items: ConversationMessage[]) => {
    setMessages((current) => [...current, ...items]);
    setConversationHistory((current) => trimHistory([...current, ...items]));
    window.setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const invalidateERPQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    queryClient.invalidateQueries({ queryKey: ["customers-for-sale"] });
    queryClient.invalidateQueries({ queryKey: ["products-for-sale"] });
    queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
    queryClient.invalidateQueries({ queryKey: ["payments-sales"] });
  };

  const loadProactiveInsights = useCallback(async () => {
    if (!companyId) return;
    const insights = await getProactiveInsights(supabase, companyId);
    setProactiveInsights(insights);
  }, [companyId]);

  useEffect(() => {
    loadProactiveInsights();
  }, [loadProactiveInsights]);

  const confirmDraft = async () => {
    if (!pendingDraft || !companyId) return;
    setIsSaving(true);
    try {
      const result = await executeAutomationDraft(supabase, pendingDraft, companyId, user?.id);
      setPendingDraft(null);
      invalidateERPQueries();
      pushMessages(buildConversationMessage("assistant", `${result.title}\n${result.body}`, { intent: "crud_action", confidence: 1, crud_action: "create_customer" as const }));
      toast({ title: result.title, description: result.body });
      loadProactiveInsights();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the ERP entry.";
      pushMessages(buildConversationMessage("assistant", `I could not save that entry.\n${message}`, { intent: "unknown", confidence: 0 }));
      toast({ title: "Automation failed", description: message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const resetSmartReview = () => {
    setSmartResolution(null);
    setSelectedProductIds({});
    setSelectedCustomer(null);
    setChatFlow({ kind: "idle" });
  };

  const findCustomerByMobile = async (mobile: string) => {
    if (!companyId) return null;
    const { data } = await supabase
      .from("customers")
      .select("id, name, phone, address, gst_number")
      .eq("company_id", companyId)
      .ilike("phone", `%${mobile}%`)
      .limit(1)
      .maybeSingle();
    return data as CustomerChoice | null;
  };

  const extractMobile = (text: string) => text.match(/\+?[0-9][0-9\s-]{7,15}/)?.[0]?.replace(/\D/g, "") || "";

  const parseCustomerDetails = (text: string, mobile: string) => {
    const name =
      text.match(/\b(?:name|customer)\b[:\s-]*([^,;\n]+)/i)?.[1]?.trim() ||
      text.split(/,|;/)[0]?.replace(/\b(name|customer)\b[:\s-]*/i, "").trim();
    const address = text.match(/\b(?:address|addr)\b[:\s-]*([^;\n]+)/i)?.[1]?.trim();
    const gst = text.match(/\b(?:gst|gstin)\b[:\s-]*([0-9a-z]{10,20})/i)?.[1]?.toUpperCase();
    const email = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
    return { name, phone: mobile, address: address || null, gst_number: gst || null, email: email || null };
  };

  const createCustomerFromChat = async (text: string, mobile: string) => {
    if (!companyId) return null;
    const details = parseCustomerDetails(text, mobile);
    if (!details.name) return null;
    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: details.name,
        phone: details.phone,
        address: details.address,
        gst_number: details.gst_number,
        email: details.email,
        notes: "Created from automation chat",
        company_id: companyId,
      })
      .select("id, name, phone, address, gst_number")
      .single();
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    return data as CustomerChoice;
  };

  const presentSalesResolution = async (orderText: string, customer: CustomerChoice, attachments: AutomationAttachment[]) => {
    if (!companyId) return;
    const resolution = await resolveSalesDraftSmart(supabase, orderText, companyId);
    if (resolution.intent.data.items.length === 0) {
      pushMessages(buildConversationMessage("assistant", "I could not find a drug/order item in that message. Please type like: add paracetamol 2 strip.", { intent: "crud_action", confidence: 0 }));
      return;
    }
    const hasAnyChoice = resolution.productChoices.some((group) => group.choices.length > 0);
    if (!hasAnyChoice) {
      pushMessages(buildConversationMessage("assistant", resolution.messages.join("\n") || "We do not have that drug in stock.", { intent: "crud_action", confidence: 0 }));
      return;
    }
    const initialProducts: Record<number, string> = {};
    resolution.productChoices.forEach((group) => {
      if (group.choices.length === 1) {
        initialProducts[group.itemIndex] = group.choices[0].id;
      }
    });
    setSmartResolution(resolution);
    setSelectedProductIds(initialProducts);
    setSelectedCustomer(customer);
    setPendingDraft(null);
    setPrescriptionAttachment(attachments[0] || null);
    setChatFlow({ kind: "idle" });
    pushMessages(
      buildConversationMessage(
        "assistant",
        [
          `Customer found: ${customer.name}${customer.phone ? ` (${customer.phone})` : ""}`,
          "Available drug matches are listed below. Choose the exact product/alternate, then create a pending draft for approval.",
          ...resolution.messages,
        ].join("\n"),
        { intent: "crud_action", confidence: 0.9, crud_action: "create_sale_draft" }
      )
    );
  };

  const beginSalesConversation = async (orderText: string) => {
    const attachments = prescriptionAttachment ? [prescriptionAttachment] : [];
    const mobile = extractMobile(orderText);
    if (!mobile) {
      setChatFlow({ kind: "await_mobile", orderText, attachments });
      setPendingDraft(null);
      setSmartResolution(null);
      pushMessages(buildConversationMessage("assistant", "Please send the customer's mobile number first.", { intent: "crud_action", confidence: 0.5, crud_action: "create_sale_draft" }));
      return;
    }
    const customer = await findCustomerByMobile(mobile);
    if (customer) {
      await presentSalesResolution(orderText, customer, attachments);
      return;
    }
    setChatFlow({ kind: "await_customer_details", orderText, mobile, attachments });
    pushMessages(
      buildConversationMessage(
        "assistant",
        `No customer found for ${mobile}. Please send customer details: name, address, GSTIN if any, email if any.`,
        { intent: "crud_action", confidence: 0.5, crud_action: "create_sale_draft" }
      )
    );
  };

  const publishSmartReview = () => {
    if (!smartResolution) return;
    const intent = applySmartSalesSelection(smartResolution, selectedProductIds, selectedCustomer);
    if (intent.missing.length > 0) {
      pushMessages(buildConversationMessage("assistant", `Please choose ${intent.missing.join(", ")} before publishing.`, { intent: "crud_action", confidence: 0 }));
      return;
    }
    const attachments = prescriptionAttachment ? [prescriptionAttachment] : [];
    const draft = buildDraft("chat", smartResolution.originalText, intent, attachments);
    setPendingDraft(draft);
    resetSmartReview();
    setPrescriptionAttachment(null);
    pushMessages(
      buildConversationMessage(
        "assistant",
        `Sales order draft ready. Reply YES or press Publish Draft.\n\n${describeIntent(intent)}`,
        { intent: "crud_action", confidence: 0.9, crud_action: "create_sale_draft" }
      )
    );
  };

  const handleAIResponse = async (text: string) => {
    if (!companyId || !user) return;

    setIsAiLoading(true);
    try {
      const response = await callAIAssistant(supabase, {
        message: text,
        companyId,
        userRole,
        businessType,
        history: conversationHistory,
        conversationId,
      });

      setConversationId(response.conversation_id);

      const assistantCards: AssistantCard[] = response.reply.cards || [];
      const assistantMeta: AssistantMeta = response.meta;
      let assistantDraft: AutomationDraft | undefined;

      if (response.meta.intent === "crud_action" && response.meta.crud_action) {
        const crudAction = response.meta.crud_action;

        if (crudAction === "create_sale_draft" && response.meta.confidence >= 0.5) {
          setIsAiLoading(false);
          await beginSalesConversation(text);
          return;
        }

        if (response.reply.draft?.intent && response.meta.confidence >= 0.7) {
          const intentData = response.reply.draft.intent;
          if (intentData.missing?.length === 0 && KNOWN_CRUD_INTENTS.has(intentData.type)) {
            assistantDraft = buildDraft("chat", text, intentData);
            setPendingDraft(assistantDraft);
          }
        }
      }

      if (response.meta.intent === "data_query" && assistantCards.length > 0) {
        // query results are already in cards
      }

      pushMessages(
        buildConversationMessage(
          "assistant",
          response.reply.text,
          assistantMeta,
          assistantCards,
          assistantDraft
        )
      );

      if (response.reply.suggestions) {
        // suggestions are handled by hint chips
      }
    } catch (error) {
      const regexFallback = handleRegexFallback(text);
      if (!regexFallback) {
        pushMessages(
          buildConversationMessage(
            "assistant",
            "I'm having trouble connecting to the AI service. The regex parser is available for basic commands.",
            { intent: "unknown", confidence: 0 }
          )
        );
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleRegexFallback = (text: string): boolean => {
    const intent = parseAutomationText(text);

    if (intent.type === "unknown") {
      pushMessages(
        buildConversationMessage(
          "assistant",
          "I can create customers, products, record payments, create sales drafts, and answer data questions. Try one of the example messages below.",
          { intent: "unknown", confidence: 0.1 }
        )
      );
      return true;
    }

    if (intent.missing.length > 0) {
      pushMessages(
        buildConversationMessage(
          "assistant",
          `I understood the request, but I need ${intent.missing.join(", ")} before I can make a draft.`,
          { intent: intent.type, confidence: intent.confidence }
        )
      );
      return true;
    }

    if (intent.type === "create_sale_draft") {
      beginSalesConversation(text);
      return true;
    }

    const attachments = prescriptionAttachment ? [prescriptionAttachment] : [];
    const draft = buildDraft("chat", text, intent, attachments);
    resetSmartReview();
    setPendingDraft(draft);
    setPrescriptionAttachment(null);
    pushMessages(
      buildConversationMessage(
        "assistant",
        `Draft ready for review. Reply YES or press Publish Draft.\n\n${describeIntent(intent)}`,
        { intent: intent.type, confidence: intent.confidence },
        undefined,
        draft
      )
    );
    return true;
  };

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isSaving || isAiLoading) return;
    setInput("");

    pushMessages(buildConversationMessage("user", text));

    if (/^(yes|confirm|save|done)$/i.test(text)) {
      if (!pendingDraft) {
        pushMessages(buildConversationMessage("assistant", "There is no pending draft to save.", { intent: "unknown", confidence: 0 }));
        return;
      }
      await confirmDraft();
      return;
    }

    if (/^(cancel|discard|no)$/i.test(text)) {
      setPendingDraft(null);
      resetSmartReview();
      clearPrescriptionAttachment();
      pushMessages(buildConversationMessage("assistant", "Draft discarded.", { intent: "unknown", confidence: 0 }));
      return;
    }

    if (chatFlow.kind === "await_mobile") {
      const mobile = extractMobile(text);
      if (!mobile) {
        pushMessages(buildConversationMessage("assistant", "Please send a valid mobile number.", { intent: "crud_action", confidence: 0.5 }));
        return;
      }
      const customer = await findCustomerByMobile(mobile);
      if (customer) {
        await presentSalesResolution(chatFlow.orderText, customer, chatFlow.attachments);
        return;
      }
      setChatFlow({ kind: "await_customer_details", orderText: chatFlow.orderText, mobile, attachments: chatFlow.attachments });
      pushMessages(buildConversationMessage("assistant", `No customer found for ${mobile}. Please send name, address, GSTIN if any, email if any.`, { intent: "crud_action", confidence: 0.5 }));
      return;
    }

    if (chatFlow.kind === "await_customer_details") {
      try {
        const customer = await createCustomerFromChat(text, chatFlow.mobile);
        if (!customer) {
          pushMessages(buildConversationMessage("assistant", "Please include at least customer name. Example: name Rahul Sharma, address Pune", { intent: "crud_action", confidence: 0.3 }));
          return;
        }
        await presentSalesResolution(chatFlow.orderText, customer, chatFlow.attachments);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not create customer.";
        pushMessages(buildConversationMessage("assistant", message, { intent: "crud_action", confidence: 0 }));
      }
      return;
    }

    await handleAIResponse(text);
  };

  const handlePrescriptionPick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Image required", description: "Attach a prescription photo or image file.", variant: "destructive" });
      return;
    }
    clearPrescriptionAttachment();
    setPrescriptionAttachment({
      kind: "prescription",
      name: file.name,
      type: file.type,
      size: file.size,
      file,
      previewUrl: URL.createObjectURL(file),
    });
  };

  const startNewConversation = () => {
    setConversationId(crypto.randomUUID());
    setConversationHistory([]);
    setMessages([
      buildConversationMessage(
        "assistant",
        "New conversation started. How can I help you?",
        { intent: "unknown", confidence: 1 }
      ),
    ]);
    setPendingDraft(null);
    resetSmartReview();
    clearPrescriptionAttachment();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="AI Assistant"
        description="Your conversational copilot for managing ERP records and data"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="min-h-[calc(100vh-190px)]">
          <CardContent className="flex min-h-[calc(100vh-190px)] flex-col p-0">
            <div className="flex items-center gap-2 border-b p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-medium">ERP AI Assistant</p>
                <p className="text-xs text-muted-foreground">Create records, query data, get insights</p>
              </div>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={startNewConversation}>
                <Plus className="h-4 w-4 mr-1" />
                New Chat
              </Button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[86%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "border bg-card text-card-foreground"
                    }`}
                  >
                    {message.meta?.intent && message.role === "assistant" && (
                      <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                        {message.meta.intent === "crud_action" && message.meta.crud_action
                          ? message.meta.crud_action.replace(/_/g, " ")
                          : message.meta.intent === "data_query"
                          ? "Data query"
                          : message.meta.intent === "insight_request"
                          ? "Business insight"
                          : message.meta.intent === "navigation_help"
                          ? "Navigation"
                          : ""}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                    {message.cards?.map((card, idx) => (
                      <AssistantCardRenderer
                        key={idx}
                        card={card}
                        onNavigate={(path) => navigate(path)}
                      />
                    ))}
                    {message.meta?.sql && (
                      <details className="mt-2">
                        <summary className="text-[11px] text-muted-foreground cursor-pointer">View SQL</summary>
                        <pre className="mt-1 p-2 bg-muted rounded text-[11px] overflow-x-auto">{message.meta.sql}</pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className="flex justify-start">
                  <div className="border bg-card text-card-foreground rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Thinking...
                    </div>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>

            {proactiveInsights.length > 0 && (
              <div className="border-t px-3 py-2">
                <div className="flex items-center gap-1 mb-1">
                  <TrendingUp className="h-3 w-3 text-primary" />
                  <span className="text-[11px] font-medium text-muted-foreground">Insights</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {proactiveInsights.map((insight) => (
                    <button
                      key={insight.id}
                      type="button"
                      onClick={() => {
                        if (insight.action) navigate(insight.action.path);
                      }}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border transition-colors hover:bg-accent ${
                        insight.severity === "critical" ? "border-destructive/40 text-destructive" :
                        insight.severity === "warning" ? "border-yellow-500/40 text-yellow-600" :
                        "border-primary/40 text-primary"
                      }`}
                    >
                      {severityIcon(insight.severity)}
                      {insight.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {pendingDraft && (
              <div className="border-t bg-accent/40 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Pending action for review</p>
                    <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{pendingSummary}</p>
                    {pendingDraft.attachments?.length ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Prescription image attached: {pendingDraft.attachments[0].name}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPendingDraft(null)} disabled={isSaving}>
                      <X className="h-4 w-4" />
                      Discard
                    </Button>
                    <Button size="sm" onClick={confirmDraft} disabled={!canSave}>
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Publish Draft
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {smartResolution && (
              <div className="border-t bg-accent/40 p-3">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Review sales order intent</p>
                    <p className="text-xs text-muted-foreground">
                      Pick the exact drug/brand and customer. Publishing creates a pending Sales order for approval.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {smartResolution.productChoices.map((group) => (
                      <div key={group.itemIndex} className="rounded-md border bg-background p-2">
                        <p className="mb-2 text-xs font-medium">
                          {smartResolution.intent.data.items[group.itemIndex]?.quantity} {smartResolution.intent.data.items[group.itemIndex]?.unit || "unit"} of "{group.originalName}"
                        </p>
                        <div className="grid gap-1">
                          {group.choices.length === 0 ? (
                            <p className="text-xs text-destructive">No catalog match. Add the product first or type a clearer brand/generic name.</p>
                          ) : group.choices.map((choice) => (
                            <button
                              key={choice.id}
                              type="button"
                              onClick={() => setSelectedProductIds((current) => ({ ...current, [group.itemIndex]: choice.id }))}
                              className={`rounded border px-2 py-1.5 text-left text-xs transition-colors ${
                                selectedProductIds[group.itemIndex] === choice.id
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "bg-card hover:bg-accent"
                              }`}
                            >
                              <span className="font-medium">{choice.label}</span>
                              <span className="ml-2 text-muted-foreground">Rs {choice.sale_price || choice.mrp} · GST {choice.gst_percentage}% · Stock {choice.stock_quantity}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md border bg-background p-2">
                    <p className="mb-2 text-xs font-medium">Customer</p>
                    <div className="grid gap-1">
                      {smartResolution.customerChoices.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No customer selected. Add customer details first or create a customer record.</p>
                      ) : smartResolution.customerChoices.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => setSelectedCustomer(customer)}
                          className={`rounded border px-2 py-1.5 text-left text-xs transition-colors ${
                            selectedCustomer?.id === customer.id
                              ? "border-primary bg-primary/10 text-primary"
                              : "bg-card hover:bg-accent"
                          }`}
                        >
                          <span className="font-medium">{customer.name}</span>
                          {customer.phone && <span className="ml-2 text-muted-foreground">{customer.phone}</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={resetSmartReview} disabled={isSaving}>
                      <X className="h-4 w-4" />
                      Discard
                    </Button>
                    <Button size="sm" onClick={publishSmartReview} disabled={isSaving}>
                      <Check className="h-4 w-4" />
                      Create Pending Draft
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t px-3 py-2">
              <div className="flex flex-wrap gap-1 mb-2">
                {hintChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setInput(chip)}
                    className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {prescriptionAttachment && (
                <div className="mb-2 flex items-center gap-3 rounded-md border bg-muted/30 p-2">
                  {prescriptionAttachment.previewUrl && (
                    <img
                      src={prescriptionAttachment.previewUrl}
                      alt="Prescription preview"
                      className="h-12 w-12 rounded border object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{prescriptionAttachment.name}</p>
                    <p className="text-[11px] text-muted-foreground">Will be uploaded when draft is published</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={clearPrescriptionAttachment}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handlePrescriptionPick(event.target.files?.[0])}
                />
                <Button type="button" variant="outline" className="h-auto px-3" onClick={() => fileInputRef.current?.click()} disabled={isSaving || isAiLoading}>
                  <ImagePlus className="h-4 w-4" />
                </Button>
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Ask me anything or type a command..."
                  className="min-h-[48px] resize-none"
                />
                <Button className="h-auto px-3" onClick={handleSubmit} disabled={!input.trim() || isSaving || isAiLoading}>
                  {isAiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">What I can do</h2>
              </div>
              <Separator />
              <div className="grid gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Create & update records</div>
                <div className="flex items-center gap-2"><Table2 className="h-3.5 w-3.5" /> Query any business data</div>
                <div className="flex items-center gap-2"><TrendingUp className="h-3.5 w-3.5" /> Business health insights</div>
                <div className="flex items-center gap-2"><ExternalLink className="h-3.5 w-3.5" /> Navigate the app</div>
                <div className="flex items-center gap-2"><ImagePlus className="h-3.5 w-3.5" /> Prescription to sales draft</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">Try asking</h2>
              <div className="space-y-2">
                {FALLBACK_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setInput(example)}
                    className="w-full rounded-md border bg-background p-2 text-left text-xs leading-relaxed text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
