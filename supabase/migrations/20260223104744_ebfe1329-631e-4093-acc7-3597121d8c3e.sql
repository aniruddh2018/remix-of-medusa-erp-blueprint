
-- Add bank details columns to invoice_settings
ALTER TABLE public.invoice_settings
  ADD COLUMN IF NOT EXISTS bank_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_number text DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_ifsc text DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_branch text DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_holder text DEFAULT '';
