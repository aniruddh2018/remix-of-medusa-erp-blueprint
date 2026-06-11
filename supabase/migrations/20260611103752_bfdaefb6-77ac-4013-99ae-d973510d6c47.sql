
-- 1. agent_conversations
CREATE TABLE public.agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_conversations TO authenticated;
GRANT ALL ON public.agent_conversations TO service_role;
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own agent conversations" ON public.agent_conversations
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.is_super_admin(auth.uid())
  );
CREATE POLICY "Create own agent conversations" ON public.agent_conversations
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND company_id = public.get_user_company_id(auth.uid())
  );
CREATE POLICY "Update own agent conversations" ON public.agent_conversations
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete own agent conversations" ON public.agent_conversations
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_agent_conversations_user ON public.agent_conversations(user_id, created_at DESC);
CREATE INDEX idx_agent_conversations_company ON public.agent_conversations(company_id);

CREATE TRIGGER trg_agent_conversations_updated_at
  BEFORE UPDATE ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. agent_messages
CREATE TABLE public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.agent_messages TO authenticated;
GRANT ALL ON public.agent_messages TO service_role;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View messages of own conversations" ON public.agent_messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.agent_conversations c
      WHERE c.id = conversation_id
        AND (c.user_id = auth.uid() OR public.is_super_admin(auth.uid()))
    )
  );
CREATE POLICY "Insert messages into own conversations" ON public.agent_messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY "Delete messages from own conversations" ON public.agent_messages
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.agent_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );
CREATE INDEX idx_agent_messages_conv ON public.agent_messages(conversation_id, created_at);

-- 3. agent_pending_actions
CREATE TABLE public.agent_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  validated_input jsonb NOT NULL,
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','executed','failed','expired')),
  result jsonb,
  client_action_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  resolved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.agent_pending_actions TO authenticated;
GRANT ALL ON public.agent_pending_actions TO service_role;
ALTER TABLE public.agent_pending_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own pending actions" ON public.agent_pending_actions
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.is_super_admin(auth.uid())
  );
CREATE POLICY "Insert own pending actions" ON public.agent_pending_actions
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND company_id = public.get_user_company_id(auth.uid())
  );
CREATE POLICY "Update own pending actions" ON public.agent_pending_actions
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE UNIQUE INDEX idx_agent_pending_client_action ON public.agent_pending_actions(client_action_id)
  WHERE client_action_id IS NOT NULL;
CREATE INDEX idx_agent_pending_conv ON public.agent_pending_actions(conversation_id, created_at DESC);
CREATE INDEX idx_agent_pending_status ON public.agent_pending_actions(status, expires_at);

-- 4. agent_audit_log
CREATE TABLE public.agent_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.agent_conversations(id) ON DELETE SET NULL,
  pending_action_id uuid REFERENCES public.agent_pending_actions(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  raw_prompt text,
  input jsonb,
  output jsonb,
  status text NOT NULL CHECK (status IN ('proposed','approved','rejected','executed','failed','expired')),
  error_code text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agent_audit_log TO authenticated;
GRANT ALL ON public.agent_audit_log TO service_role;
ALTER TABLE public.agent_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own audit entries" ON public.agent_audit_log
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_super_admin(auth.uid())
  );
CREATE POLICY "Insert own audit entries" ON public.agent_audit_log
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
  );
CREATE INDEX idx_agent_audit_company ON public.agent_audit_log(company_id, created_at DESC);
CREATE INDEX idx_agent_audit_conv ON public.agent_audit_log(conversation_id, created_at DESC);
