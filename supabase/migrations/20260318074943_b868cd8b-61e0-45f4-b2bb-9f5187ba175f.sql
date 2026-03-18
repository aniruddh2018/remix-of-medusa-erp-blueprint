
-- Add extended invoice/billing settings columns
ALTER TABLE public.invoice_settings
  ADD COLUMN IF NOT EXISTS invoice_layout text NOT NULL DEFAULT 'a4',
  ADD COLUMN IF NOT EXISTS show_batch_column boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_expiry_column boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_free_qty_column boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_hsn_column boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_tax_amount_column boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_rate_column boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_roundoff boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_gst_split boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS print_font_size text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS enable_batch_tracking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_expiry_tracking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_negative_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_payment_method text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS default_customer_name text NOT NULL DEFAULT 'Walk-in Customer',
  ADD COLUMN IF NOT EXISTS show_salesperson boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_alignment text NOT NULL DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS logo_alignment text NOT NULL DEFAULT 'left';
