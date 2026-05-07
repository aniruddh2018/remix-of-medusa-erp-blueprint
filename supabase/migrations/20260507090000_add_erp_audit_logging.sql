-- Unified ERP audit log for CRUD activity across core business tables.
CREATE TABLE IF NOT EXISTS public.erp_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.erp_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own company ERP audit logs"
  ON public.erp_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Insert own company ERP audit logs"
  ON public.erp_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_erp_audit_logs_company_created_at
  ON public.erp_audit_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_erp_audit_logs_table_action
  ON public.erp_audit_logs(table_name, action);

CREATE OR REPLACE FUNCTION public.audit_log_core_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_actor uuid;
  v_record_id text;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    BEGIN
      v_actor := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        v_actor := NULL;
    END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_company_id := NEW.company_id;
    v_record_id := NEW.id::text;
  ELSIF TG_OP = 'UPDATE' THEN
    v_company_id := COALESCE(NEW.company_id, OLD.company_id);
    v_record_id := COALESCE(NEW.id, OLD.id)::text;
  ELSE
    v_company_id := OLD.company_id;
    v_record_id := OLD.id::text;
  END IF;

  INSERT INTO public.erp_audit_logs (
    company_id,
    actor_user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    metadata
  )
  VALUES (
    v_company_id,
    v_actor,
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    jsonb_build_object('schema', TG_TABLE_SCHEMA, 'trigger', TG_NAME)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_products ON public.products;
CREATE TRIGGER trg_audit_products
AFTER INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.audit_log_core_changes();

DROP TRIGGER IF EXISTS trg_audit_suppliers ON public.suppliers;
CREATE TRIGGER trg_audit_suppliers
AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.audit_log_core_changes();

DROP TRIGGER IF EXISTS trg_audit_customers ON public.customers;
CREATE TRIGGER trg_audit_customers
AFTER INSERT OR UPDATE OR DELETE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.audit_log_core_changes();

DROP TRIGGER IF EXISTS trg_audit_purchase_orders ON public.purchase_orders;
CREATE TRIGGER trg_audit_purchase_orders
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.audit_log_core_changes();

DROP TRIGGER IF EXISTS trg_audit_purchase_order_items ON public.purchase_order_items;
CREATE TRIGGER trg_audit_purchase_order_items
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.audit_log_core_changes();

DROP TRIGGER IF EXISTS trg_audit_sales_orders ON public.sales_orders;
CREATE TRIGGER trg_audit_sales_orders
AFTER INSERT OR UPDATE OR DELETE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.audit_log_core_changes();

DROP TRIGGER IF EXISTS trg_audit_sales_order_items ON public.sales_order_items;
CREATE TRIGGER trg_audit_sales_order_items
AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_items
FOR EACH ROW EXECUTE FUNCTION public.audit_log_core_changes();

DROP TRIGGER IF EXISTS trg_audit_inventory_batches ON public.inventory_batches;
CREATE TRIGGER trg_audit_inventory_batches
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_batches
FOR EACH ROW EXECUTE FUNCTION public.audit_log_core_changes();

DROP TRIGGER IF EXISTS trg_audit_payments ON public.payments;
CREATE TRIGGER trg_audit_payments
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.audit_log_core_changes();

DROP TRIGGER IF EXISTS trg_audit_debit_notes ON public.debit_notes;
CREATE TRIGGER trg_audit_debit_notes
AFTER INSERT OR UPDATE OR DELETE ON public.debit_notes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_core_changes();

DROP TRIGGER IF EXISTS trg_audit_debit_note_items ON public.debit_note_items;
CREATE TRIGGER trg_audit_debit_note_items
AFTER INSERT OR UPDATE OR DELETE ON public.debit_note_items
FOR EACH ROW EXECUTE FUNCTION public.audit_log_core_changes();

DROP TRIGGER IF EXISTS trg_audit_credit_notes ON public.credit_notes;
CREATE TRIGGER trg_audit_credit_notes
AFTER INSERT OR UPDATE OR DELETE ON public.credit_notes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_core_changes();

DROP TRIGGER IF EXISTS trg_audit_credit_note_items ON public.credit_note_items;
CREATE TRIGGER trg_audit_credit_note_items
AFTER INSERT OR UPDATE OR DELETE ON public.credit_note_items
FOR EACH ROW EXECUTE FUNCTION public.audit_log_core_changes();
