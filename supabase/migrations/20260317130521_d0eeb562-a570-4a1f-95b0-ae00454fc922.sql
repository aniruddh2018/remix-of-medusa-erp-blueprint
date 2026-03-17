
-- Form field configurations per module per company
CREATE TABLE public.form_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  module text NOT NULL, -- 'sales', 'purchase_orders', 'products', 'suppliers', 'customers', 'counter_sale'
  config_version integer NOT NULL DEFAULT 1,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- fields: [{key, label, type, placeholder, helpText, required, visible, order, section, defaultValue, options, computeFormula, width}]
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- sections: [{key, label, order, collapsible, defaultOpen}]
  ui_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- ui_overrides: {submitButtonText, cancelButtonText, formTitle, formDescription, successMessage}
  layout jsonb NOT NULL DEFAULT '{"columns": 2}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(company_id, module)
);

ALTER TABLE public.form_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own company form configs" ON public.form_configs
  FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) AND company_id = get_user_company_id(auth.uid()))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company form configs" ON public.form_configs
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

-- Business rules engine
CREATE TABLE public.business_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  module text NOT NULL,
  name text NOT NULL,
  description text,
  rule_type text NOT NULL DEFAULT 'validation',
  -- rule_type: 'validation', 'visibility', 'auto_fill', 'auto_calculate', 'approval', 'alert'
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- conditions: [{field, operator, value, logicOperator}]
  -- operator: 'equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'is_empty', 'is_not_empty'
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- actions: [{type, target, value, message}]
  -- type: 'show_field', 'hide_field', 'set_required', 'set_value', 'show_alert', 'block_submit', 'apply_discount'
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.business_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own company rules" ON public.business_rules
  FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) AND company_id = get_user_company_id(auth.uid()))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own company rules" ON public.business_rules
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

-- Config version history for rollback
CREATE TABLE public.config_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  module text NOT NULL,
  config_type text NOT NULL, -- 'form_config' or 'business_rule'
  config_snapshot jsonb NOT NULL,
  version integer NOT NULL,
  changed_by uuid,
  change_description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.config_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own config history" ON public.config_history
  FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) AND company_id = get_user_company_id(auth.uid()))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "View own config history" ON public.config_history
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
