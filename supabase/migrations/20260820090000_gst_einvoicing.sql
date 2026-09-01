-- ============================================================================
-- GST e-Invoicing (IRN via NIC direct API) + e-Way Bill
-- ============================================================================
-- Adds:
--   1. e-Invoice / e-Way Bill status columns on sales_orders
--   2. gst_einvoice_credentials — per-company NIC API credentials (secrets;
--      readable/writable only by the gst-einvoice edge function via the
--      service role — NOT exposed to the browser client, same pattern as
--      TWILIO_API_KEY / LOVABLE_API_KEY used by supabase/functions/twilio-send)
--   3. gst_einvoice_log — audit trail of every IRN / e-Way Bill API call
-- ============================================================================

-- ── 0. pincode is mandatory on the GST e-Invoice schema (seller & buyer)
--    but wasn't previously captured on companies/customers.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS pincode TEXT;

-- ── 1. sales_orders: e-Invoice + e-Way Bill state ──────────────────────────
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS einvoice_status text NOT NULL DEFAULT 'not_generated',
  ADD COLUMN IF NOT EXISTS einvoice_irn text,
  ADD COLUMN IF NOT EXISTS einvoice_ack_no text,
  ADD COLUMN IF NOT EXISTS einvoice_ack_date timestamptz,
  ADD COLUMN IF NOT EXISTS einvoice_signed_invoice text,
  ADD COLUMN IF NOT EXISTS einvoice_signed_qr_code text,
  ADD COLUMN IF NOT EXISTS einvoice_error text,
  ADD COLUMN IF NOT EXISTS einvoice_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS einvoice_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS einvoice_cancel_reason text,
  ADD COLUMN IF NOT EXISTS einvoice_is_mock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eway_status text NOT NULL DEFAULT 'not_generated',
  ADD COLUMN IF NOT EXISTS eway_bill_no text,
  ADD COLUMN IF NOT EXISTS eway_bill_date timestamptz,
  ADD COLUMN IF NOT EXISTS eway_valid_till timestamptz,
  ADD COLUMN IF NOT EXISTS eway_error text,
  ADD COLUMN IF NOT EXISTS eway_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS eway_is_mock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transporter_id text,
  ADD COLUMN IF NOT EXISTS transporter_name text,
  ADD COLUMN IF NOT EXISTS transport_mode text,
  ADD COLUMN IF NOT EXISTS transport_doc_number text,
  ADD COLUMN IF NOT EXISTS vehicle_number text,
  ADD COLUMN IF NOT EXISTS distance_km numeric;

ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_einvoice_status_check;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_einvoice_status_check
  CHECK (einvoice_status IN ('not_generated', 'pending', 'generated', 'cancelled', 'failed'));

ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_eway_status_check;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_eway_status_check
  CHECK (eway_status IN ('not_generated', 'pending', 'generated', 'cancelled', 'failed'));

CREATE INDEX IF NOT EXISTS sales_orders_einvoice_irn_idx ON public.sales_orders(einvoice_irn) WHERE einvoice_irn IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_orders_einvoice_status_idx ON public.sales_orders(company_id, einvoice_status);

-- ── 2. gst_einvoice_credentials (secrets — service_role only) ─────────────
CREATE TABLE IF NOT EXISTS public.gst_einvoice_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  env TEXT NOT NULL DEFAULT 'sandbox' CHECK (env IN ('sandbox', 'production')),
  gstin TEXT,
  username TEXT,
  password TEXT,
  client_id TEXT,
  client_secret TEXT,
  public_key_pem TEXT,
  auth_token TEXT,
  sek TEXT,
  token_expiry TIMESTAMPTZ,
  -- Base URL + resource paths. Defaults reflect the publicly documented NIC
  -- e-Invoice sandbox layout, but NIC revises API versions (v1.03/v1.04/...)
  -- and these are only fully confirmed after logging into the taxpayer's own
  -- registered sandbox/prod portal — so they're stored per-company and
  -- editable from Settings rather than hardcoded, in case they need
  -- correcting for a given account/version without a code deploy.
  api_base_url TEXT NOT NULL DEFAULT 'https://einv-apisandbox.nic.in',
  auth_path TEXT NOT NULL DEFAULT '/eivital/v1.04/auth',
  generate_irn_path TEXT NOT NULL DEFAULT '/eicore/v1.03/Invoice',
  cancel_irn_path TEXT NOT NULL DEFAULT '/eicore/v1.03/Invoice/Cancel',
  generate_ewb_path TEXT NOT NULL DEFAULT '/eiewb/v1.03/ewaybill',
  cancel_ewb_path TEXT NOT NULL DEFAULT '/eiewb/v1.03/ewaybill/cancel',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deliberately no policies granted to `authenticated`: this table holds NIC
-- API secrets (client_secret / password). RLS is enabled with zero policies
-- for authenticated users, so it denies all client access by default. Only
-- the service_role (used exclusively inside supabase/functions/gst-einvoice)
-- can read or write it. The frontend never queries this table directly —
-- it goes through the edge function's save_credentials / get_status actions,
-- which verify the caller is a company admin before touching this table.
ALTER TABLE public.gst_einvoice_credentials ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.gst_einvoice_credentials TO service_role;

DROP TRIGGER IF EXISTS trg_gst_einvoice_credentials_updated_at ON public.gst_einvoice_credentials;
CREATE TRIGGER trg_gst_einvoice_credentials_updated_at
  BEFORE UPDATE ON public.gst_einvoice_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 3. gst_einvoice_log (audit trail) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gst_einvoice_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sales_order_id UUID REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('generate_irn', 'cancel_irn', 'generate_ewaybill', 'cancel_ewaybill')),
  request_payload JSONB,
  response_payload JSONB,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  is_mock BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gst_einvoice_log_sales_order_idx ON public.gst_einvoice_log(sales_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gst_einvoice_log_company_idx ON public.gst_einvoice_log(company_id, created_at DESC);

GRANT SELECT ON public.gst_einvoice_log TO authenticated;
GRANT ALL ON public.gst_einvoice_log TO service_role;
ALTER TABLE public.gst_einvoice_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gst_einvoice_log company read" ON public.gst_einvoice_log;
CREATE POLICY "gst_einvoice_log company read"
  ON public.gst_einvoice_log FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
         OR public.is_super_admin(auth.uid()));
-- No INSERT/UPDATE/DELETE policy for authenticated: only the edge function
-- (service_role) writes audit rows, so client-side rows can't be forged.
