import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ImagePlus, Loader2, MessageSquare, Send, Sparkles, X } from "lucide-react";
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

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: string;
};

type ChatFlow =
  | { kind: "idle" }
  | { kind: "await_mobile"; orderText: string; attachments: AutomationAttachment[] }
  | { kind: "await_customer_details"; orderText: string; mobile: string; attachments: AutomationAttachment[] };

const examples = [
  "Add customer Raj Traders phone 9876543210 gst 27ABCDE1234F1Z5 address Pune",
  "Add product Crocin 650 manufacturer GSK mrp 35 purchase 25 gst 12 unit strip",
  "Record payment from Raj Traders amount 2500 via UPI",
  "Create sale for Raj Traders item 10 Crocin 650 rate 35 gst 12",
  "Add a paracetamol 2 strip",
];

function makeMessage(role: ChatMessage["role"], text: string, meta?: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    meta,
  };
}

export default function Chat() {
  const { user } = useAuth();
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    makeMessage(
      "assistant",
      "Tell me what to enter in ERP. I will parse it, show a draft, and wait for confirmation before saving.",
      "Prototype chat adapter"
    ),
  ]);

  const canSave = !!companyId && !isSaving;

  const pendingSummary = useMemo(() => {
    return pendingDraft ? describeIntent(pendingDraft.intent) : "";
  }, [pendingDraft]);

  const clearPrescriptionAttachment = () => {
    if (prescriptionAttachment?.previewUrl) URL.revokeObjectURL(prescriptionAttachment.previewUrl);
    setPrescriptionAttachment(null);
  };

  const pushMessages = (...items: ChatMessage[]) => {
    setMessages((current) => [...current, ...items]);
    window.setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

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
      pushMessages(makeMessage("assistant", `${result.title}\n${result.body}`, result.recordType));
      toast({ title: result.title, description: result.body });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the ERP entry.";
      pushMessages(makeMessage("assistant", `I could not save that entry.\n${message}`, "Save failed"));
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
      pushMessages(makeMessage("assistant", "I could not find a drug/order item in that message. Please type like: add paracetamol 2 strip.", "No item"));
      return;
    }
    const hasAnyChoice = resolution.productChoices.some((group) => group.choices.length > 0);
    if (!hasAnyChoice) {
      pushMessages(makeMessage("assistant", resolution.messages.join("\n") || "We do not have that drug in stock.", "Rejected"));
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
      makeMessage(
        "assistant",
        [
          `Customer found: ${customer.name}${customer.phone ? ` (${customer.phone})` : ""}`,
          "Available drug matches are listed below. Choose the exact product/alternate, then create a pending draft for approval.",
          ...resolution.messages,
        ].join("\n"),
        "Stock checked"
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
      pushMessages(makeMessage("assistant", "Please send the customer's mobile number first.", "Customer lookup"));
      return;
    }
    const customer = await findCustomerByMobile(mobile);
    if (customer) {
      await presentSalesResolution(orderText, customer, attachments);
      return;
    }
    setChatFlow({ kind: "await_customer_details", orderText, mobile, attachments });
    pushMessages(
      makeMessage(
        "assistant",
        `No customer found for ${mobile}. Please send customer details: name, address, GSTIN if any, email if any.`,
        "New customer"
      )
    );
  };

  const publishSmartReview = () => {
    if (!smartResolution) return;
    const intent = applySmartSalesSelection(smartResolution, selectedProductIds, selectedCustomer);
    if (intent.missing.length > 0) {
      pushMessages(makeMessage("assistant", `Please choose ${intent.missing.join(", ")} before publishing.`, "Review incomplete"));
      return;
    }
    const attachments = prescriptionAttachment ? [prescriptionAttachment] : [];
    const draft = buildDraft("chat", smartResolution.originalText, intent, attachments);
    setPendingDraft(draft);
    resetSmartReview();
    setPrescriptionAttachment(null);
    pushMessages(
      makeMessage(
        "assistant",
        `Sales order draft ready. Reply YES or press Publish Draft.\n\n${describeIntent(intent)}`,
        "Resolved product + customer"
      )
    );
  };

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isSaving) return;
    setInput("");
    pushMessages(makeMessage("user", text));

    if (/^(yes|confirm|save|done)$/i.test(text)) {
      if (!pendingDraft) {
        pushMessages(makeMessage("assistant", "There is no pending draft to save.", "Nothing pending"));
        return;
      }
      await confirmDraft();
      return;
    }

    if (/^(cancel|discard|no)$/i.test(text)) {
      setPendingDraft(null);
      resetSmartReview();
      clearPrescriptionAttachment();
      pushMessages(makeMessage("assistant", "Draft discarded.", "Cancelled"));
      return;
    }

    if (chatFlow.kind === "await_mobile") {
      const mobile = extractMobile(text);
      if (!mobile) {
        pushMessages(makeMessage("assistant", "Please send a valid mobile number.", "Customer lookup"));
        return;
      }
      const customer = await findCustomerByMobile(mobile);
      if (customer) {
        await presentSalesResolution(chatFlow.orderText, customer, chatFlow.attachments);
        return;
      }
      setChatFlow({ kind: "await_customer_details", orderText: chatFlow.orderText, mobile, attachments: chatFlow.attachments });
      pushMessages(makeMessage("assistant", `No customer found for ${mobile}. Please send name, address, GSTIN if any, email if any.`, "New customer"));
      return;
    }

    if (chatFlow.kind === "await_customer_details") {
      try {
        const customer = await createCustomerFromChat(text, chatFlow.mobile);
        if (!customer) {
          pushMessages(makeMessage("assistant", "Please include at least customer name. Example: name Rahul Sharma, address Pune", "Need customer name"));
          return;
        }
        await presentSalesResolution(chatFlow.orderText, customer, chatFlow.attachments);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not create customer.";
        pushMessages(makeMessage("assistant", message, "Customer save failed"));
      }
      return;
    }

    const intent = parseAutomationText(text);
    if ((intent.type === "create_sale_draft" || intent.type === "unknown") && companyId) {
      const resolution = await resolveSalesDraftSmart(supabase, text, companyId);
      if (resolution.intent.data.items.length > 0) {
        await beginSalesConversation(text);
        return;
      }
    }

    if (intent.type === "unknown") {
      pushMessages(
        makeMessage(
          "assistant",
          "I can create customers, create products, record customer payments, and create pending sales-order drafts. Try one of the example messages below.",
          "Not understood"
        )
      );
      return;
    }

    if (intent.missing.length > 0) {
      pushMessages(
        makeMessage(
          "assistant",
          `I understood the request, but I need ${intent.missing.join(", ")} before I can make a draft.`,
          "Missing details"
        )
      );
      return;
    }

    const attachments = prescriptionAttachment ? [prescriptionAttachment] : [];
    const draft = buildDraft("chat", text, intent, attachments);
    resetSmartReview();
    setPendingDraft(draft);
    setPrescriptionAttachment(null);
    pushMessages(
      makeMessage(
        "assistant",
        `Draft ready for review. Reply YES or press Publish Draft to create a pending sales order.\n\n${describeIntent(intent)}`,
        `${Math.round(intent.confidence * 100)}% parser confidence${attachments.length ? " · prescription attached" : ""}`
      )
    );
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

  const useExample = (example: string) => {
    setInput(example);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Automation Chat"
        description="Prototype text-to-ERP entries here, then replace the chat adapter with WhatsApp webhooks later."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-h-[calc(100vh-190px)]">
          <CardContent className="flex min-h-[calc(100vh-190px)] flex-col p-0">
            <div className="flex items-center gap-2 border-b p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-medium">ERP automation adapter</p>
                <p className="text-xs text-muted-foreground">Chat today, WhatsApp tomorrow</p>
              </div>
              <Badge variant="secondary" className="ml-auto">Prototype</Badge>
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
                    {message.meta && (
                      <p className={`mb-1 text-[11px] font-medium ${message.role === "user" ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                        {message.meta}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                  </div>
                </div>
              ))}
              <div ref={scrollRef} />
            </div>

            {pendingDraft && (
              <div className="border-t bg-accent/40 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Pending sales order review draft</p>
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

            <div className="border-t p-3">
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
                <Button type="button" variant="outline" className="h-auto px-3" onClick={() => fileInputRef.current?.click()} disabled={isSaving}>
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
                  placeholder="Type WhatsApp-style order text, attach Rx image if needed..."
                  className="min-h-[48px] resize-none"
                />
                <Button className="h-auto px-3" onClick={handleSubmit} disabled={!input.trim() || isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
                <h2 className="text-sm font-semibold">Supported actions</h2>
              </div>
              <Separator />
              <div className="grid gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Create customer</div>
                <div className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Create product</div>
                <div className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Record payment</div>
                <div className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Text + prescription to sales draft</div>
                <div className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Publish pending order for review</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">Try messages</h2>
              <div className="space-y-2">
                {examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => useExample(example)}
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
