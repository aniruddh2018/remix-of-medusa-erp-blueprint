-- Phase 1: per-product batch tracking + expiry config
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS batch_tracking_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expiry_required boolean;

-- nullable expiry_required: NULL = use company default, true/false = override

ALTER TABLE public.invoice_settings
  ADD COLUMN IF NOT EXISTS block_expired_sales boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expiry_required_default boolean NOT NULL DEFAULT true;

-- Helpful index for "credit customers" / overdue lookups
CREATE INDEX IF NOT EXISTS idx_sales_orders_payment_status_company
  ON public.sales_orders(company_id, payment_status)
  WHERE payment_status IN ('credit', 'partial');