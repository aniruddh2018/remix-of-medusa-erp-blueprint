import { useEffect, useRef, useState } from "react";
import { Bot, Brain, ChevronDown, ChevronRight, Loader2, Send, User, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PendingActionCard, type PendingActionStatus } from "@/components/chat/PendingActionCard";

interface ThinkingStep {
  step: number;
  type: "reasoning" | "tool_call" | string;
  content?: string;
  tool?: string;
  args?: any;
  result?: any;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  pendingActionId?: string;
  pendingTool?: string;
  pendingPreview?: any;
  pendingStatus?: PendingActionStatus;
  thinking?: ThinkingStep[];
}


const EXAMPLES = [
  "Add customer Raj Traders phone 9876543210",
  "Record payment ₹2500 from Raj Traders against invoice INV-001",
  "Add supplier Sun Pharma GSTIN 27AAACS1234A1Z5",
  "What's outstanding for Raj Traders?",
];

export default function Chat() {
  const { isAdmin, isPharmacist } = useAuth();
  const { toast } = useToast();
  const canMutate = isAdmin || isPharmacist;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const userText = text.trim();
    if (!userText || sending) return;
    setInput("");
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text: userText };
    setMessages(m => [...m, userMsg]);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("action-agent", {
        body: { action: "chat", message: userText, conversation_id: conversationId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.conversation_id) setConversationId(data.conversation_id);
      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: data?.reply || "(no response)",
        pendingActionId: data?.pending_action_id || undefined,
        pendingTool: data?.pending_tool || undefined,
        pendingPreview: data?.pending_preview || undefined,
        pendingStatus: data?.pending_action_id ? "pending" : undefined,
        thinking: Array.isArray(data?.thinking) ? data.thinking : undefined,
      };
      setMessages(m => [...m, reply]);

    } catch (e: any) {
      toast({ title: "Assistant error", description: e?.message || String(e), variant: "destructive" });
      setMessages(m => [...m, { id: crypto.randomUUID(), role: "assistant", text: `⚠️ ${e?.message || "Failed"}` }]);
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <PageHeader
        title="Automation Chat"
        description="AI assistant — ask, confirm, done"
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-w-3xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <Bot className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <div>
              <h3 className="font-medium">How can I help?</h3>
              <p className="text-sm text-muted-foreground">I'll always show a confirmation card before changing anything.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-xl mx-auto">
              {EXAMPLES.map(ex => (
                <Button key={ex} variant="outline" size="sm" onClick={() => send(ex)}>{ex}</Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, idx) => (
          <div key={m.id} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className={`max-w-[80%] ${m.role === "user" ? "order-1" : ""}`}>
              {m.role === "user" ? (
                <Card className="px-3 py-2 bg-primary text-primary-foreground border-primary">
                  <p className="text-sm whitespace-pre-wrap">{m.text}</p>
                </Card>
              ) : (
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.text}</div>
              )}
              {m.pendingActionId && m.pendingTool && (
                <PendingActionCard
                  pendingActionId={m.pendingActionId}
                  tool={m.pendingTool}
                  preview={m.pendingPreview}
                  initialStatus={m.pendingStatus || "pending"}
                  canMutate={canMutate}
                  onResolved={(status, output) => {
                    setMessages(prev => prev.map((pm, i) => i === idx ? { ...pm, pendingStatus: status } : pm));
                    if (status === "executed") {
                      setMessages(prev => [...prev, {
                        id: crypto.randomUUID(), role: "assistant",
                        text: `✓ Done. ${output ? "" : ""}`.trim(),
                      }]);
                    }
                  }}
                />
              )}
            </div>
            {m.role === "user" && (
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 order-2">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex gap-2 items-center text-sm text-muted-foreground">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <div className="border-t bg-background px-4 py-3">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything — add customer, record payment, check outstanding…"
            className="min-h-[44px] max-h-32 resize-none"
            disabled={sending}
          />
          <Button onClick={() => send(input)} disabled={!input.trim() || sending} size="icon" className="h-11 w-11">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        {!canMutate && (
          <p className="text-xs text-muted-foreground text-center mt-2 max-w-3xl mx-auto">
            You have read-only access. Mutations require admin or pharmacist role.
          </p>
        )}
      </div>
    </div>
  );
}
