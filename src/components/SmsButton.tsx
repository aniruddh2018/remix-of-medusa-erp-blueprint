import { useState } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { WhatsAppTemplateKey } from "@/lib/whatsapp";

interface Props extends Omit<ButtonProps, "onClick"> {
  phone: string | null | undefined;
  channel?: "sms" | "whatsapp";
  templateKey: WhatsAppTemplateKey;
  vars: Record<string, string | number | null | undefined>;
  relatedInvoiceId?: string | null;
  label?: string;
  iconOnly?: boolean;
}

/** Sends an SMS or WhatsApp message through the twilio-send edge function. */
export function SmsButton({
  phone,
  channel = "sms",
  templateKey,
  vars,
  relatedInvoiceId,
  label = channel === "whatsapp" ? "Send via Twilio WhatsApp" : "Send SMS",
  iconOnly,
  variant = "ghost",
  size = "icon",
  className,
  ...rest
}: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (!phone) {
      toast({ title: "No phone number", description: "Add a phone number to this contact.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("twilio-send", {
        body: { channel, to: phone, templateKey, vars, relatedInvoiceId: relatedInvoiceId ?? null },
      });
      if (error) throw error;
      toast({
        title: channel === "whatsapp" ? "WhatsApp sent" : "SMS sent",
        description: `Status: ${data?.status ?? "queued"}`,
      });
    } catch (err) {
      toast({
        title: channel === "whatsapp" ? "WhatsApp failed" : "SMS failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleClick}
      variant={variant}
      size={size}
      disabled={busy || (rest as { disabled?: boolean }).disabled}
      title={label}
      className={`text-blue-600 hover:text-blue-700 hover:bg-blue-500/10 ${className ?? ""}`}
      {...rest}
    >
      {busy ? (
        <Loader2 className={iconOnly ? "h-3.5 w-3.5 animate-spin" : "h-4 w-4 animate-spin"} />
      ) : (
        <MessageSquare className={iconOnly ? "h-3.5 w-3.5" : "h-4 w-4"} />
      )}
      {!iconOnly && <span className="ml-1.5">{busy ? "Sending…" : label}</span>}
    </Button>
  );
}
