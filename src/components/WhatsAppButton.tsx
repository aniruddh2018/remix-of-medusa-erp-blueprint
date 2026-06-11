import { MessageCircle } from "lucide-react";
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

interface Props extends Omit<ButtonProps, "onClick"> {
  phone: string | null | undefined;
  templateKey: WhatsAppTemplateKey;
  vars: Record<string, string | number | null | undefined>;
  label?: string;
  iconOnly?: boolean;
}

export function WhatsAppButton({
  phone,
  templateKey,
  vars,
  label = "WhatsApp",
  iconOnly,
  variant = "ghost",
  size = "icon",
  className,
  ...rest
}: Props) {
  const { templates } = useWhatsAppTemplates();
  const { companyName } = useBusiness();
  const { toast } = useToast();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const tpl = templates?.[templateKey];
    if (tpl && tpl.enabled === false) {
      toast({ title: "WhatsApp template disabled", description: "Enable it in Settings → WhatsApp Templates." });
      return;
    }
    const body = tpl?.body ?? DEFAULT_WA_TEMPLATES[templateKey].body;
    const message = renderWhatsAppTemplate(body, { company: companyName || "", ...vars });
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
      className={`text-green-600 hover:text-green-700 hover:bg-green-500/10 ${className ?? ""}`}
      title={label}
      {...rest}
    >
      <MessageCircle className={iconOnly ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {!iconOnly && <span className="ml-1.5">{label}</span>}
    </Button>
  );
}
