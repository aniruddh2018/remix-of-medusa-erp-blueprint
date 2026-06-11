import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MessageCircle, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { DEFAULT_WA_TEMPLATES, type WhatsAppTemplateKey } from "@/lib/whatsapp";

const PLACEHOLDER_HELP: Record<WhatsAppTemplateKey, string> = {
  invoice_sent: "{customer} {invoice_no} {amount} {date} {company} {pdf_url}",
  payment_reminder: "{customer} {invoice_no} {balance} {days_overdue} {date} {company}",
  purchase_order: "{supplier} {po_no} {amount} {date} {company} {pdf_url}",
  order_status: "{customer} {invoice_no} {amount} {status} {company}",
};

export function WhatsAppTemplatesSection() {
  const { templates, isLoading, upsert } = useWhatsAppTemplates();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Record<WhatsAppTemplateKey, { body: string; enabled: boolean }> | null>(null);
  const [savingKey, setSavingKey] = useState<WhatsAppTemplateKey | null>(null);

  useEffect(() => {
    if (templates && !draft) {
      const d = {} as Record<WhatsAppTemplateKey, { body: string; enabled: boolean }>;
      (Object.keys(templates) as WhatsAppTemplateKey[]).forEach((k) => {
        d[k] = { body: templates[k].body, enabled: templates[k].enabled };
      });
      setDraft(d);
    }
  }, [templates, draft]);

  const handleSave = async (key: WhatsAppTemplateKey) => {
    if (!draft) return;
    setSavingKey(key);
    try {
      await upsert.mutateAsync({ key, body: draft[key].body, enabled: draft[key].enabled });
      toast({ title: "Template saved" });
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-green-600" />
          WhatsApp Templates
        </CardTitle>
        <CardDescription>
          Customize the messages used by the WhatsApp buttons across the app. Buttons open <code>wa.me</code> with the rendered text — no API setup required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading || !draft ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          (Object.keys(DEFAULT_WA_TEMPLATES) as WhatsAppTemplateKey[]).map((key) => {
            const meta = DEFAULT_WA_TEMPLATES[key];
            const value = draft[key];
            return (
              <div key={key} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label className="text-base font-semibold">{meta.label}</Label>
                    <p className="text-xs text-muted-foreground">{meta.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`enable-${key}`} className="text-xs text-muted-foreground">Enabled</Label>
                    <Switch
                      id={`enable-${key}`}
                      checked={value.enabled}
                      onCheckedChange={(v) => setDraft({ ...draft, [key]: { ...value, enabled: v } })}
                    />
                  </div>
                </div>
                <Textarea
                  rows={6}
                  value={value.body}
                  onChange={(e) => setDraft({ ...draft, [key]: { ...value, body: e.target.value } })}
                  className="font-mono text-sm"
                />
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    Placeholders: <span className="font-mono">{PLACEHOLDER_HELP[key]}</span>
                  </p>
                  <Button size="sm" onClick={() => handleSave(key)} disabled={savingKey === key}>
                    {savingKey === key ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                    Save
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
