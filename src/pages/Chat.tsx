import { useMemo, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ImagePlus, Loader2, MessageSquare, Send, Sparkles, X, Plus } from "lucide-react";
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
  buildConversationMessage,
} from "@/services/aiAssistant";
import type { ConversationMessage, AutomationDraft as AssistantDraft } from "@/types/aiAssistant";

const KNOWN_CRUD_INTENTS = new Set([
  "create_customer", "create_product", "record_payment",
  "create_sale_draft", "update_customer", "update_product", "cancel_order",
]);

const EXAMPLES = [
  "Add customer Raj Traders phone 9876543210",
  "Add product Crocin 650 manufacturer GSK mrp 35",
  "Record payment from Raj Traders amount 2500 via UPI",
  "Create sale for Raj Traders item 10 Crocin 650",
];

type ChatFlow =
  | { kind: "idle" }
  | { kind: "await_mobile"; orderText: string; attachments: AutomationAttachment[] }
  | { kind: "await_customer_details"; orderText: string; mobile: string; attachments: AutomationAttachment[] };

export default function Chat() {
  const { user, roles } = useAuth();
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [input, setInput] = useState("");
  const [prescriptionAttachment, setPrescriptionAttachment] = useState<AutomationAttachment | null>(null);
  const [pendingDraft, setPendingDraft] = useState<AutomationDraft | null>(null);
  const [smartResolution, setSmartResolution] = useState<SmartSalesResolution | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Record<number, string>>({});
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerChoice | null>(null);
  const [chatFlow, setChatFlow] = useState<ChatFlow>({ kind: "idle" });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<ConversationMessage[]>([
    buildConversationMessage(
      "assistant",
      "Tell me what to create or record. I'll parse it, show a draft, and wait for your confirmation before saving.",
    ),
  ]);

  const pendingSummary = useMemo(() => {
    return pendingDraft ? describeIntent(pendingDraft.intent) : "";
  }, [pendingDraft]);

  const clearPrescriptionAttachment = () => {
    if (prescriptionAttachment?.previewUrl) URL.revokeObjectURL(prescriptionAttachment.previewUrl);
    setPrescriptionAttachment(null);
  };

  const pushMessages = useCallback((...items: ConversationMessage[]) => {
    setMessages((current) => {
      const updated = [...current, ...items];
      if (updated.length > 40) return updated.slice(-40);
      return updated;
    });
    setConversationHistory((current) => {
      const updated = [...current, ...items];
      if (updated.length > 20) return updated.slice(-20);
      return updated;
    });
    window.setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const invalidateERPQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    queryClient.invalidateQueries({ queryKey: ["customers-for-sale"] });
    queryClient.invalidateQueries({ queryKey: ["products-for-sale"] });
    queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
    queryClient.invalidateQueries({ queryKey: ["payments-sales"] });
  };

  const confirmDraft = async () => {
    if (!pendingDraft || !companyId) return;
    setIsSaving(true);
    try {
      const result = await executeAutomationDraft(supabase, pendingDraft, companyId, user?.id);
      setPendingDraft(null);
      invalidateERPQueries();
      pushMessages(buildConversationMessage("assistant", `${result.title}\n${result.body}`));
      toast({ title: result.title, description: result.body });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the ERP entry.";
      pushMessages(buildConversationMessage("assistant", `Could not save.\n${message}`));
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
      pushMessages(buildConversationMessage("assistant", "Could not find an item in that message. Try: add paracetamol 2 strip."));
      return;
    }
    const hasAnyChoice = resolution.productChoices.some((group) => group.choices.length > 0);
    if (!hasAnyChoice) {
      pushMessages(buildConversationMessage("assistant", resolution.messages.join("\n") || "We do not have that drug in stock."));
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
          `Customer: ${customer.name}${customer.phone ? ` (${customer.phone})` : ""}`,
          "Pick the exact product/brand, then I'll create a draft for review.",
          ...resolution.messages,
        ].join("\n"),
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
      pushMessages(buildConversationMessage("assistant", "Send the customer's mobile number first."));
      return;
    }
    const customer = await findCustomerByMobile(mobile);
    if (customer) {
      await presentSalesResolution(orderText, customer, attachments);
      return;
    }
    setChatFlow({ kind: "await_customer_details", orderText, mobile, attachments });
    pushMessages(buildConversationMessage("assistant", `No customer found for ${mobile}. Send: name, address, GSTIN if any.`));
  };

  const publishSmartReview = () => {
    if (!smartResolution) return;
    const intent = applySmartSalesSelection(smartResolution, selectedProductIds, selectedCustomer);
    if (intent.missing.length > 0) {
      pushMessages(buildConversationMessage("assistant", `Please select ${intent.missing.join(", ")} first.`));
      return;
    }
    const attachments = prescriptionAttachment ? [prescriptionAttachment] : [];
    const draft = buildDraft("chat", smartResolution.originalText, intent, attachments);
    setPendingDraft(draft);
    resetSmartReview();
    setPrescriptionAttachment(null);
    pushMessages(buildConversationMessage("assistant", `Draft ready. Reply YES or press Publish.\n\n${describeIntent(intent)}`));
  };

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isSaving || isLoading) return;
    setInput("");
    pushMessages(buildConversationMessage("user", text));

    if (/^(yes|confirm|save|done)$/i.test(text)) {
      if (!pendingDraft) {
        pushMessages(buildConversationMessage("assistant", "No draft to save."));
        return;
      }
      await confirmDraft();
      return;
    }

    if (/^(cancel|discard|no)$/i.test(text)) {
      setPendingDraft(null);
      resetSmartReview();
      clearPrescriptionAttachment();
      pushMessages(buildConversationMessage("assistant", "Draft discarded."));
      return;
    }

    if (chatFlow.kind === "await_mobile") {
      const mobile = extractMobile(text);
      if (!mobile) {
        pushMessages(buildConversationMessage("assistant", "Send a valid mobile number."));
        return;
      }
      const customer = await findCustomerByMobile(mobile);
      if (customer) {
        await presentSalesResolution(chatFlow.orderText, customer, chatFlow.attachments);
        return;
      }
      setChatFlow({ kind: "await_customer_details", orderText: chatFlow.orderText, mobile, attachments: chatFlow.attachments });
      pushMessages(buildConversationMessage("assistant", `No customer for ${mobile}. Send name, address, GSTIN if any.`));
      return;
    }

    if (chatFlow.kind === "await_customer_details") {
      try {
        const customer = await createCustomerFromChat(text, chatFlow.mobile);
        if (!customer) {
          pushMessages(buildConversationMessage("assistant", "Include at least a name. Example: name Rahul Sharma, address Pune"));
          return;
        }
        await presentSalesResolution(chatFlow.orderText, customer, chatFlow.attachments);
      } catch (error) {
        pushMessages(buildConversationMessage("assistant", error instanceof Error ? error.message : "Could not create customer."));
      }
      return;
    }

    setIsLoading(true);
    try {
      const response = await callAIAssistant(supabase, {
        message: text,
        companyId: companyId || "",
        userRole: roles?.[0] || "staff",
        businessType: "pharmacy",
        history: conversationHistory,
      });

      if (response.meta?.intent === "crud_action" && response.meta?.crud_action) {
        const crudAction = response.meta.crud_action;

        if (crudAction === "create_sale_draft" && response.meta.confidence >= 0.5) {
          await beginSalesConversation(text);
          setIsLoading(false);
          return;
        }

        const intentData = response.reply?.draft?.intent;
        if (intentData && response.meta.confidence >= 0.7) {
          if (intentData.missing?.length === 0 && KNOWN_CRUD_INTENTS.has(intentData.type)) {
            const draft = buildDraft("chat", text, intentData);
            setPendingDraft(draft);
            pushMessages(buildConversationMessage("assistant", `${response.reply.text}\n\nDraft ready for review. Reply YES to save.`));
            setIsLoading(false);
            return;
          }
        }

        if (intentData && (intentData.missing?.length ?? 0) > 0) {
          pushMessages(buildConversationMessage("assistant", response.reply.text));
          setIsLoading(false);
          return;
        }
      }

      if (response.reply?.text) {
        pushMessages(buildConversationMessage("assistant", response.reply.text));
      }
    } catch {
      const intent = parseAutomationText(text);

      if (intent.type === "unknown") {
        pushMessages(buildConversationMessage("assistant", "I can create customers, products, record payments, and sales drafts. Try: 'Add customer ABC phone 9876543210'"));
        setIsLoading(false);
        return;
      }

      if (intent.missing.length > 0) {
        pushMessages(buildConversationMessage("assistant", `Need: ${intent.missing.join(", ")}. Please provide these details.`));
        setIsLoading(false);
        return;
      }

      if (intent.type === "create_sale_draft") {
        await beginSalesConversation(text);
        setIsLoading(false);
        return;
      }

      const attachments = prescriptionAttachment ? [prescriptionAttachment] : [];
      const draft = buildDraft("chat", text, intent, attachments);
      setPendingDraft(draft);
      setPrescriptionAttachment(null);
      pushMessages(buildConversationMessage("assistant", `Draft ready. Reply YES or press Publish.\n\n${describeIntent(intent)}`));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrescriptionPick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Image required", description: "Attach a prescription photo or image.", variant: "destructive" });
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
    setConversationHistory([]);
    setMessages([
      buildConversationMessage(
        "assistant",
        "Tell me what to create or record. I'll parse it, show a draft, and wait for your confirmation before saving.",
      ),
    ]);
    setPendingDraft(null);
    resetSmartReview();
    clearPrescriptionAttachment();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Automation Chat"
        description="Text commands to create customers, products, payments, and sales — with confirmation before saving."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="min-h-[calc(100vh-190px)]">
          <CardContent className="flex min-h-[calc(100vh-190px)] flex-col p-0">
            <div className="flex items-center gap-2 border-b p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-medium">ERP Automation</p>
                <p className="text-xs text-muted-foreground">Text-to-action with guardrails</p>
              </div>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={startNewConversation}>
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[86%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "border bg-card text-card-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="border bg-card rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Parsing...
                    </div>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>

            {pendingDraft && (
              <div className="border-t bg-accent/40 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Draft for review</p>
                    <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{pendingSummary}</p>
                    {pendingDraft.attachments?.length ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">Prescription attached: {pendingDraft.attachments[0].name}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPendingDraft(null)} disabled={isSaving}>
                      <X className="h-4 w-4" /> Discard
                    </Button>
                    <Button size="sm" onClick={confirmDraft} disabled={isSaving || !companyId}>
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
                    <p className="text-sm font-medium">Review sales order</p>
                    <p className="text-xs text-muted-foreground">Pick the exact product/brand and customer, then I'll create a draft.</p>
                  </div>

                  <div className="space-y-2">
                    {smartResolution.productChoices.map((group) => (
                      <div key={group.itemIndex} className="rounded-md border bg-background p-2">
                        <p className="mb-2 text-xs font-medium">
                          {smartResolution.intent.data.items[group.itemIndex]?.quantity} {smartResolution.intent.data.items[group.itemIndex]?.unit || "unit"} of &quot;{group.originalName}&quot;
                        </p>
                        <div className="grid gap-1">
                          {group.choices.length === 0 ? (
                            <p className="text-xs text-destructive">No catalog match. Add the product or type a clearer name.</p>
                          ) : group.choices.map((choice) => (
                            <button
                              key={choice.id}
                              type="button"
                              onClick={() => setSelectedProductIds((c) => ({ ...c, [group.itemIndex]: choice.id }))}
                              className={`rounded border px-2 py-1.5 text-left text-xs transition-colors ${
                                selectedProductIds[group.itemIndex] === choice.id ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-accent"
                              }`}
                            >
                              <span className="font-medium">{choice.label}</span>
                              <span className="ml-2 text-muted-foreground">Rs {choice.sale_price || choice.mrp} · Stock {choice.stock_quantity}</span>
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
                        <p className="text-xs text-muted-foreground">No customer. Send their details first.</p>
                      ) : smartResolution.customerChoices.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => setSelectedCustomer(customer)}
                          className={`rounded border px-2 py-1.5 text-left text-xs transition-colors ${
                            selectedCustomer?.id === customer.id ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-accent"
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
                      <X className="h-4 w-4" /> Discard
                    </Button>
                    <Button size="sm" onClick={publishSmartReview} disabled={isSaving}>
                      <Check className="h-4 w-4" /> Create Draft
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t p-3">
              {prescriptionAttachment && (
                <div className="mb-2 flex items-center gap-3 rounded-md border bg-muted/30 p-2">
                  {prescriptionAttachment.previewUrl && (
                    <img src={prescriptionAttachment.previewUrl} alt="Rx" className="h-12 w-12 rounded border object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{prescriptionAttachment.name}</p>
                    <p className="text-[11px] text-muted-foreground">Attached to this draft</p>
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
                  onChange={(e) => handlePrescriptionPick(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto px-3"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSaving || isLoading}
                  title="Attach prescription"
                >
                  <ImagePlus className="h-4 w-4" />
                </Button>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Add customer Raj Traders phone 9876543210..."
                  className="min-h-[48px] resize-none"
                />
                <Button className="h-auto px-3" onClick={handleSubmit} disabled={!input.trim() || isSaving || isLoading}>
                  {isLoading || isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
                <h2 className="text-sm font-semibold">What I do</h2>
              </div>
              <Separator />
              <div className="grid gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Create customers & products</div>
                <div className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Record customer payments</div>
                <div className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Create sales order drafts</div>
                <div className="flex items-center gap-2"><ImagePlus className="h-3.5 w-3.5" /> Attach prescriptions</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">Try commands</h2>
              <div className="space-y-2">
                {EXAMPLES.map((example) => (
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