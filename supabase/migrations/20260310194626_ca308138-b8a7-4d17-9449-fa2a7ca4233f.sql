
ALTER TABLE public.invoice_settings
  ADD COLUMN IF NOT EXISTS discount_mode text NOT NULL DEFAULT 'both'
    CHECK (discount_mode IN ('percentage', 'flat', 'both')),
  ADD COLUMN IF NOT EXISTS show_discount_row boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_bill_discount boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bill_discount_mode text NOT NULL DEFAULT 'both'
    CHECK (bill_discount_mode IN ('percentage', 'flat', 'both')),
  ADD COLUMN IF NOT EXISTS max_discount_admin numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_discount_pharmacist numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_discount_staff numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS discount_before_tax boolean NOT NULL DEFAULT true;
