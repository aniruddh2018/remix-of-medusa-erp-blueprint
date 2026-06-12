import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Copy, Save, Loader2, Send, Inbox, AlertTriangle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

type Settings = {
  id?: string;
  company_id: string;
  sms_from: string | null;
  whatsapp_from: string | null;
  enabled: boolean;
};

type MessageRow = {
  id: string;
  direction: "outbound" | "inbound";
  channel: "sms" | "whatsapp";
  to_number: string;
  from_number: string | null;
  body: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export function TwilioSection() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const qc = useQueryClient();

  const webhookUrl = `${SUPABASE_URL}/functions/v1/twilio-inbound`;

  const settingsQ = useQuery({
    queryKey: ["twilio-settings", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Settings | null> => {
      const { data, error } = await (supabase.from("twilio_settings" as never) as never as {
        select: (s: string) => { eq: (k: string, v: unknown) => { maybeSingle: () => Promise<{ data: Settings | null; error: Error | null }> } };
      }).select("*").eq("company_id", companyId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [draft, setDraft] = useState<{ sms_from: string; whatsapp_from: string; enabled: boolean }>({
    sms_from: "", whatsapp_from: "", enabled: true,
  });

  useEffect(() => {
    if (settingsQ.data) {
      setDraft({
        sms_from: settingsQ.data.sms_from ?? "",
        whatsapp_from: settingsQ.data.whatsapp_from ?? "",
        enabled: settingsQ.data.enabled,
      });
    }
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company");
      const payload = {
        company_id: companyId,
        sms_from: draft.sms_from.trim() || null,
        whatsapp_from: draft.whatsapp_from.trim() || null,
        enabled: draft.enabled,
      };
      const { error } = await (supabase.from("twilio_settings" as never) as never as {
        upsert: (v: unknown, o: unknown) => Promise<{ error: Error | null }>;
      }).upsert(payload, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Twilio settings saved" });
      qc.invalidateQueries({ queryKey: ["twilio-settings", companyId] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const messagesQ = useQuery({
    queryKey: ["twilio-messages", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await (supabase.from("twilio_messages" as never) as never as {
        select: (s: string) => { eq: (k: string, v: unknown) => { order: (c: string, o: unknown) => { limit: (n: number) => Promise<{ data: MessageRow[] | null; error: Error | null }> } } };
      }).select("*").eq("company_id", companyId!).order("created_at", { ascending: false }).limit(25);
      if (error) throw error;
      return data ?? [];
    },
  });

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    toast({ title: "Webhook URL copied" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-blue-600" />
          Twilio SMS &amp; WhatsApp
        </CardTitle>
        <CardDescription>
          Send invoices and payment reminders by SMS or Twilio WhatsApp, and receive replies into the message log.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sender numbers */}
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Sender numbers</Label>
            <div className="flex items-center gap-2">
              <Label htmlFor="tw-enabled" className="text-xs text-muted-foreground">Enabled</Label>
              <Switch
                id="tw-enabled"
                checked={draft.enabled}
                onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tw-sms" className="text-xs">SMS From (E.164)</Label>
              <Input
                id="tw-sms"
                placeholder="+15558675310"
                value={draft.sms_from}
                onChange={(e) => setDraft({ ...draft, sms_from: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="tw-wa" className="text-xs">WhatsApp From</Label>
              <Input
                id="tw-wa"
                placeholder="whatsapp:+14155238886"
                value={draft.whatsapp_from}
                onChange={(e) => setDraft({ ...draft, whatsapp_from: e.target.value })}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            Enable SMS Pumping Protection and review SMS Geo Permissions in your Twilio console before going live.
          </p>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
              Save
            </Button>
          </div>
        </div>

        {/* Webhook */}
        <div className="space-y-2 rounded-lg border p-4">
          <Label className="text-base font-semibold">Inbound webhook URL</Label>
          <p className="text-xs text-muted-foreground">
            In Twilio Console → Phone Numbers → your number → Messaging → <strong>A message comes in</strong> → Webhook,
            paste this URL with method <code>HTTP POST</code>. Repeat for the WhatsApp sender under WhatsApp Senders.
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={copyWebhook}>
              <Copy className="h-3 w-3 mr-1" /> Copy
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href="https://console.twilio.com" target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3 mr-1" /> Console
              </a>
            </Button>
          </div>
        </div>

        {/* Bulk send */}
        <BulkSendDialog />

        {/* Recent log */}
        <div className="space-y-2 rounded-lg border p-4">
          <Label className="text-base font-semibold">Recent messages</Label>
          {messagesQ.isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : !messagesQ.data || messagesQ.data.length === 0 ? (
            <p className="text-xs text-muted-foreground">No messages yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {messagesQ.data.map((m) => (
                <div key={m.id} className="flex items-start gap-2 text-xs rounded-md bg-muted/40 p-2">
                  <Badge variant={m.direction === "inbound" ? "secondary" : "outline"} className="shrink-0">
                    {m.direction === "inbound" ? <Inbox className="h-3 w-3 mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                    {m.channel}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">{m.direction === "inbound" ? `from ${m.from_number}` : `to ${m.to_number}`}</span>
                      <span>·</span>
                      <span>{format(new Date(m.created_at), "dd MMM HH:mm")}</span>
                      {m.status && <Badge variant="outline" className="text-[10px] h-4 px-1">{m.status}</Badge>}
                    </div>
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    {m.error_message && <div className="text-destructive text-[11px]">{m.error_message}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Bulk Send Dialog ----------------------------- */

function BulkSendDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const [templateKey, setTemplateKey] = useState<string>("payment_reminder");
  const [recipientsText, setRecipientsText] = useState("");
  const [sending, setSending] = useState(false);

  const recipients = useMemo(() => {
    return recipientsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((to) => ({ to, vars: {} }));
  }, [recipientsText]);

  const handleSend = async () => {
    if (recipients.length === 0) {
      toast({ title: "No recipients", description: "Paste one phone number per line.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("twilio-bulk-send", {
        body: { channel, templateKey, recipients },
      });
      if (error) throw error;
      toast({ title: "Bulk send complete", description: `${data?.sent ?? 0} / ${data?.total ?? recipients.length} sent` });
      setOpen(false);
    } catch (err) {
      toast({ title: "Bulk send failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg border p-4 flex items-center justify-between">
      <div>
        <Label className="text-base font-semibold">Bulk send</Label>
        <p className="text-xs text-muted-foreground">Send a templated SMS or WhatsApp to a pasted list of numbers.</p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Send className="h-3 w-3 mr-1" /> Open
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk send via Twilio</DialogTitle>
            <DialogDescription>One phone number per line. Numbers are normalised to E.164 (default country code 91).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Channel</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as "sms" | "whatsapp")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Template</Label>
                <Select value={templateKey} onValueChange={setTemplateKey}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice_sent">Invoice sent</SelectItem>
                    <SelectItem value="payment_reminder">Payment reminder</SelectItem>
                    <SelectItem value="order_status">Order status</SelectItem>
                    <SelectItem value="purchase_order">Purchase order</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Recipients</Label>
              <Textarea
                rows={8}
                placeholder={"+919876543210\n9876501234\n+14155551234"}
                value={recipientsText}
                onChange={(e) => setRecipientsText(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">{recipients.length} number(s)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
