import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  DEFAULT_WA_TEMPLATES,
  type WhatsAppTemplate,
  type WhatsAppTemplateKey,
} from "@/lib/whatsapp";

type Row = {
  id: string;
  company_id: string;
  template_key: string;
  body: string;
  enabled: boolean;
};

export function useWhatsAppTemplates() {
  const { companyId } = useBusiness();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["whatsapp-templates", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Record<WhatsAppTemplateKey, WhatsAppTemplate>> => {
      const { data, error } = await (supabase
        .from("whatsapp_templates" as never) as never as {
          select: (s: string) => { eq: (k: string, v: unknown) => Promise<{ data: Row[] | null; error: Error | null }> };
        })
        .select("id, company_id, template_key, body, enabled")
        .eq("company_id", companyId!);

      if (error) throw error;
      const byKey = new Map<string, Row>((data ?? []).map((r) => [r.template_key, r]));
      const out = {} as Record<WhatsAppTemplateKey, WhatsAppTemplate>;
      (Object.keys(DEFAULT_WA_TEMPLATES) as WhatsAppTemplateKey[]).forEach((key) => {
        const row = byKey.get(key);
        out[key] = row
          ? { id: row.id, template_key: key, body: row.body, enabled: row.enabled }
          : { template_key: key, body: DEFAULT_WA_TEMPLATES[key].body, enabled: true };
      });
      return out;
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: { key: WhatsAppTemplateKey; body: string; enabled: boolean }) => {
      if (!companyId) throw new Error("No company");
      const payload = {
        company_id: companyId,
        template_key: input.key,
        body: input.body,
        enabled: input.enabled,
      };
      const { error } = await (supabase.from("whatsapp_templates" as never) as never as {
        upsert: (v: unknown, o: unknown) => Promise<{ error: Error | null }>;
      }).upsert(payload, { onConflict: "company_id,template_key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-templates", companyId] }),
  });

  return { templates: query.data, isLoading: query.isLoading, upsert };
}
