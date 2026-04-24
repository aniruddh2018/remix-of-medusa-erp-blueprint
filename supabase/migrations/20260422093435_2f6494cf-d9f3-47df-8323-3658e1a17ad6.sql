
-- Add per-schedule prescription enforcement settings (JSONB map of schedule -> boolean)
ALTER TABLE public.invoice_settings
ADD COLUMN IF NOT EXISTS prescription_check jsonb NOT NULL DEFAULT '{
  "schedule_h": false,
  "schedule_h1": true,
  "schedule_x": true,
  "narcotic": true
}'::jsonb;

-- Add prescription metadata to sales orders (date and duration in days)
ALTER TABLE public.sales_orders
ADD COLUMN IF NOT EXISTS prescription_date date,
ADD COLUMN IF NOT EXISTS prescription_duration_days integer;
