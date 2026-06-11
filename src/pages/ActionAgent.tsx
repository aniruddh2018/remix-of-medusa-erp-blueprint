import { useEffect, useRef, useState } from "react";
import { Bot, Send, Loader2, ShieldCheck, ShieldX, Sparkles, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";

type Msg = { id: string; role: "user" | "assistant"; text: string; pending_action_id?: string | null };

type PendingAction = {
  id: string;
  tool_name: string;
  validated_input: Record<string, unknown>;
  preview: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "executed" | "failed" | "expired";
  result: Record<string, unknown> | null;
  expires_at: string;
};

const TOOL_LABELS: Record<string, string> = {
  upsert_customer: "Customer",
  create_product: "Product",
};

export default function ActionAgent() {
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const pendingIds = messages.map((m) => m.pending_action_id).filter((x): x is string => !!x);

  const { data: pendingActions } = useQuery({
    queryKey: ["agent-pending", pendingIds],
    enabled: pendingIds.length > 0,
    refetchInterval: 4000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_pending_actions" as never)
        .select("id, tool_name, validated_input, preview, status, result, expires_at")
        .in("id", pendingIds);
      if (error) throw error;
      return (data ?? []) as unknown as PendingAction[];
    },
  });

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !session) return;
    setInput("");
    setSending(true);
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text }]);
    try {
      const { data, error } = await supabase.functions.invoke("action-agent", {
        body: { action: "chat", message: text, conversation_id: conversationId },
      });
      if (error) throw error;
      const reply = data as { conversation_id: string; reply: string; pending_action_id?: string | null };
      setConversationId(reply.conversation_id);
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", text: reply.reply, pending_action_id: reply.pending_action_id },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Agent error";
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: `⚠️ ${msg}` }]);
      toast({ title: "Agent error", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const respond = async (pid: string, action: "approve" | "reject") => {
    try {
      const { data, error } = await supabase.functions.invoke("action-agent", {
        body: { action, pending_action_id: pid },
      });
      if (error) throw error;
      const r = data as { status: string; error?: string };
      if (r.status === "executed") {
        toast({ title: "Action executed", description: "The change was saved." });
        // Invalidate the touched datasets
        qc.invalidateQueries({ queryKey: ["customers"] });
        qc.invalidateQueries({ queryKey: ["products"] });
        qc.invalidateQueries({ queryKey: ["products-for-sale"] });
        qc.invalidateQueries({ queryKey: ["customers-for-sale"] });
      } else if (r.status === "rejected") {
        toast({ title: "Action rejected" });
      } else if (r.status === "failed") {
        toast({ title: "Action failed", description: r.error || "Database rejected the change.", variant: "destructive" });
      }
      qc.invalidateQueries({ queryKey: ["agent-pending"] });
    } catch (e) {
      toast({
        title: action === "approve" ? "Approve failed" : "Reject failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-4">
      <PageHeader
        title="ERP Action Agent"
        description="Tell the agent what to change. Mutations require your approval before they hit the database."
      />

      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Conversation
            <Badge variant="outline" className="ml-auto text-[10px]">Phase 1 · upsert_customer · create_product</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ScrollArea className="h-[55vh] pr-3">
            {messages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12 space-y-2">
                <Bot className="h-8 w-8 mx-auto opacity-50" />
                <p>Try: <em>"Add customer Ramesh, phone 9876543210, GSTIN 22ABCDE1234F1Z5"</em></p>
                <p>Or: <em>"Create product Paracetamol 500mg by Cipla, MRP 50, purchase 30"</em></p>
              </div>
            )}
            <div className="space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    {m.text}
                    {m.pending_action_id && (
                      <PendingActionCard
                        action={(pendingActions ?? []).find((p) => p.id === m.pending_action_id)}
                        onApprove={() => respond(m.pending_action_id!, "approve")}
                        onReject={() => respond(m.pending_action_id!, "reject")}
                      />
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="What do you want the agent to do?"
              rows={2}
              disabled={sending}
              className="resize-none"
            />
            <Button onClick={send} disabled={sending || !input.trim()} size="icon" className="h-[60px] w-[60px]">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PendingActionCard({
  action,
  onApprove,
  onReject,
}: {
  action: PendingAction | undefined;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (!action) {
    return (
      <div className="mt-2 text-xs text-muted-foreground italic flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading proposal…
      </div>
    );
  }
  const expired = action.status === "pending" && new Date(action.expires_at) < new Date();
  const label = TOOL_LABELS[action.tool_name] || action.tool_name;

  return (
    <div className="mt-3 rounded-md border bg-background text-foreground p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="h-3 w-3 text-primary" /> Proposed {label}
        </div>
        <StatusBadge status={expired ? "expired" : action.status} />
      </div>

      <PreviewBody preview={action.preview} input={action.validated_input} />

      {action.status === "pending" && !expired && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={onApprove} className="h-7 gap-1">
            <ShieldCheck className="h-3 w-3" /> Approve
          </Button>
          <Button size="sm" variant="outline" onClick={onReject} className="h-7 gap-1">
            <ShieldX className="h-3 w-3" /> Reject
          </Button>
        </div>
      )}

      {action.status === "failed" && action.result && (
        <div className="text-xs text-destructive flex items-start gap-1">
          <AlertCircle className="h-3 w-3 mt-0.5" /> {(action.result as { error?: string }).error || "Database error"}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: PendingAction["status"] }) {
  const map: Record<string, { icon: typeof CheckCircle2; label: string; cls: string }> = {
    pending: { icon: Clock, label: "Awaiting approval", cls: "bg-amber-500/10 text-amber-700 border-amber-300" },
    executed: { icon: CheckCircle2, label: "Executed", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-300" },
    approved: { icon: CheckCircle2, label: "Approved", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-300" },
    rejected: { icon: XCircle, label: "Rejected", cls: "bg-muted text-muted-foreground" },
    failed: { icon: AlertCircle, label: "Failed", cls: "bg-destructive/10 text-destructive border-destructive/30" },
    expired: { icon: Clock, label: "Expired", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[status] || map.pending;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${m.cls}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

function PreviewBody({ preview, input }: { preview: Record<string, unknown>; input: Record<string, unknown> }) {
  const kind = preview.kind as string;
  if (kind === "create_customer" || kind === "create_product") {
    const after = (preview.new || input) as Record<string, unknown>;
    const dups = (preview.possible_duplicates as Array<Record<string, unknown>>) || [];
    return (
      <div className="space-y-1 text-xs">
        <KvGrid data={after} />
        {dups.length > 0 && (
          <div className="rounded bg-amber-500/10 border border-amber-300 text-amber-800 p-2 mt-1">
            <div className="font-semibold mb-1">⚠ Possible duplicates ({dups.length})</div>
            <ul className="space-y-0.5">
              {dups.map((d) => (
                <li key={String(d.id)}>• {String(d.name)} {d.phone ? `(${d.phone})` : ""}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
  if (kind === "update_customer") {
    const before = (preview.before || {}) as Record<string, unknown>;
    const after = (preview.after || input) as Record<string, unknown>;
    return (
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="font-semibold mb-1 text-muted-foreground">Before</div>
          <KvGrid data={before} />
        </div>
        <div>
          <div className="font-semibold mb-1 text-primary">After</div>
          <KvGrid data={after} />
        </div>
      </div>
    );
  }
  return <pre className="text-[10px] bg-muted/50 p-2 rounded overflow-auto">{JSON.stringify(input, null, 2)}</pre>;
}

function KvGrid({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-0.5">
      {Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="text-muted-foreground min-w-[90px]">{k}</span>
          <span className="font-medium break-all">{String(v)}</span>
        </div>
      ))}
    </div>
  );
}
