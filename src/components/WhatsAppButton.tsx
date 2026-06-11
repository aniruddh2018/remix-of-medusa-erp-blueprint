import { useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/contexts/BusinessContext";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import {
  DEFAULT_WA_TEMPLATES,
  openWhatsApp,
  renderWhatsAppTemplate,
  type WhatsAppTemplateKey,
} from "@/lib/whatsapp";
import { uploadBillPdfAndGetUrl } from "@/lib/billPdf";
import type { BillData } from "@/utils/billGenerator";

interface Props extends Omit<ButtonProps, "onClick"> {
  phone: string | null | undefined;
  templateKey: WhatsAppTemplateKey;
  vars: Record<string, string | number | null | undefined>;
  label?: string;
  iconOnly?: boolean;
  /** When provided (or a builder), a PDF is generated, uploaded, and a signed link is appended to the message via the `{pdf_url}` placeholder. */
  bill?: BillData | (() => BillData | Promise<BillData>);
}

export function WhatsAppButton({
  phone,
  templateKey,
  vars,
  label = "WhatsApp",
  iconOnly,
  bill,
  variant = "ghost",
  size = "icon",
  className,
  ...rest
}: Props) {
  const { templates } = useWhatsAppTemplates();
  const { companyName, companyId } = useBusiness();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    const tpl = templates?.[templateKey];
    if (tpl && tpl.enabled === false) {
      toast({ title: "WhatsApp template disabled", description: "Enable it in Settings → WhatsApp Templates." });
      return;
    }

    let pdfUrl: string | undefined;
    if (bill && companyId) {
      try {
        setBusy(true);
        toast({ title: "Preparing PDF…", description: "Uploading invoice for WhatsApp link." });
        const data = typeof bill === "function" ? await bill() : bill;
        pdfUrl = await uploadBillPdfAndGetUrl(companyId, data);
      } catch (err) {
        toast({
          title: "PDF upload failed",
          description: err instanceof Error ? err.message : "Could not generate PDF.",
          variant: "destructive",
        });
        setBusy(false);
        return;
      } finally {
        setBusy(false);
      }
    }

    const body = tpl?.body ?? DEFAULT_WA_TEMPLATES[templateKey].body;
    const message = renderWhatsAppTemplate(body, {
      company: companyName || "",
      ...vars,
      pdf_url: pdfUrl ?? "",
    });
    const ok = openWhatsApp(phone, message);
    if (!ok) {
      toast({
        title: "No valid phone number",
        description: "Add a phone number to this contact to send WhatsApp messages.",
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      type="button"
      onClick={handleClick}
      variant={variant}
      size={size}
      disabled={busy || (rest as { disabled?: boolean }).disabled}
      className={`text-green-600 hover:text-green-700 hover:bg-green-500/10 ${className ?? ""}`}
      title={label}
      {...rest}
    >
      {busy ? (
        <Loader2 className={iconOnly ? "h-3.5 w-3.5 animate-spin" : "h-4 w-4 animate-spin"} />
      ) : (
        <MessageCircle className={iconOnly ? "h-3.5 w-3.5" : "h-4 w-4"} />
      )}
      {!iconOnly && <span className="ml-1.5">{busy ? "Sending…" : label}</span>}
    </Button>
  );
}
