-- ============================================================
-- CHUNK 4: Offline sync infrastructure
-- ============================================================

-- 1. Add sync metadata columns to all synced tables
DO $$
DECLARE
  t text;
  synced_tables text[] := ARRAY[
    'customers','products','suppliers','doctors',
    'sales_orders','sales_order_items',
    'purchase_orders','purchase_order_items',
    'inventory_batches','inventory_transactions',
    'payments','credit_notes','credit_note_items',
    'debit_notes','debit_note_items'
  ];
BEGIN
  FOREACH t IN ARRAY synced_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS device_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (updated_at)', t || '_updated_at_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (deleted) WHERE deleted = false', t || '_not_deleted_idx', t);
  END LOOP;
END $$;

-- 2. Auto-bump version + updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.bump_sync_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  synced_tables text[] := ARRAY[
    'customers','products','suppliers','doctors',
    'sales_orders','sales_order_items',
    'purchase_orders','purchase_order_items',
    'inventory_batches','inventory_transactions',
    'payments','credit_notes','credit_note_items',
    'debit_notes','debit_note_items'
  ];
BEGIN
  FOREACH t IN ARRAY synced_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_bump_version', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_sync_version()',
      t || '_bump_version', t
    );
  END LOOP;
END $$;

-- 3. Devices table
CREATE TABLE IF NOT EXISTS public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid,
  device_name text,
  app_version text,
  last_sync timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;

CREATE INDEX IF NOT EXISTS devices_user_id_idx ON public.devices(user_id);
CREATE INDEX IF NOT EXISTS devices_company_id_idx ON public.devices(company_id);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own devices" ON public.devices;
CREATE POLICY "Users manage own devices"
  ON public.devices
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin(auth.uid()));