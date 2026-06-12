
-- twilio_settings (per company sender numbers)
CREATE TABLE public.twilio_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  sms_from TEXT,
  whatsapp_from TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.twilio_settings TO authenticated;
GRANT ALL ON public.twilio_settings TO service_role;
ALTER TABLE public.twilio_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "twilio_settings company read"
  ON public.twilio_settings FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
         OR public.is_super_admin(auth.uid()));
CREATE POLICY "twilio_settings company write"
  ON public.twilio_settings FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
         OR public.is_super_admin(auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
              OR public.is_super_admin(auth.uid()));

-- twilio_messages (outbound + inbound log)
CREATE TABLE public.twilio_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  channel TEXT NOT NULL CHECK (channel IN ('sms','whatsapp')),
  to_number TEXT NOT NULL,
  from_number TEXT,
  body TEXT,
  template_key TEXT,
  message_sid TEXT,
  status TEXT,
  error_code TEXT,
  error_message TEXT,
  related_invoice_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX twilio_messages_company_created_idx ON public.twilio_messages(company_id, created_at DESC);
CREATE INDEX twilio_messages_sid_idx ON public.twilio_messages(message_sid);

GRANT SELECT, INSERT ON public.twilio_messages TO authenticated;
GRANT ALL ON public.twilio_messages TO service_role;
ALTER TABLE public.twilio_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "twilio_messages company read"
  ON public.twilio_messages FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
         OR public.is_super_admin(auth.uid()));
CREATE POLICY "twilio_messages company insert"
  ON public.twilio_messages FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
              OR public.is_super_admin(auth.uid()));

-- updated_at trigger for settings
CREATE TRIGGER trg_twilio_settings_updated_at
  BEFORE UPDATE ON public.twilio_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
