import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Loader2, MessageSquare, Send, Sparkles, X } from "lucide-react";
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
  parseAutomationText,
  type AutomationDraft,
} from "@/services/chatAutomation";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: string;
};

const examples = [
  "Add customer Raj Traders phone 9876543210 gst 27ABCDE1234F1Z5 address Pune",
  "Add product Crocin 650 manufacturer GSK mrp 35 purchase 25 gst 12 unit strip",
  "Record payment from Raj Traders amount 2500 via UPI",
  "Create sale for Raj Traders item 10 Crocin 650 rate 35 gst 12",
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
  const [pendingDraft, setPendingDraft] = useState<AutomationDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
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
      pushMessages(makeMessage("assistant", "Draft discarded.", "Cancelled"));
      return;
    }

    const intent = parseAutomationText(text);
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

    const draft = buildDraft("chat", text, intent);
    setPendingDraft(draft);
    pushMessages(
      makeMessage(
        "assistant",
        `Draft ready. Reply YES or press Confirm to save.\n\n${describeIntent(intent)}`,
        `${Math.round(intent.confidence * 100)}% parser confidence`
      )
    );
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
                    <p className="text-sm font-medium">Pending ERP draft</p>
                    <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{pendingSummary}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPendingDraft(null)} disabled={isSaving}>
                      <X className="h-4 w-4" />
                      Discard
                    </Button>
                    <Button size="sm" onClick={confirmDraft} disabled={!canSave}>
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Confirm
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t p-3">
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Type an ERP instruction..."
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
                <div className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Create sales-order draft</div>
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
