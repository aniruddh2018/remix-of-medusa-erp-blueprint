-- Add credit terms and payment status to sales_orders
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_period_days integer,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT false;

-- Allowed values: paid | partial | credit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_payment_status_check'
  ) THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_payment_status_check
      CHECK (payment_status IN ('paid', 'partial', 'credit'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_sales_orders_due_date
  ON public.sales_orders (company_id, due_date)
  WHERE payment_status IN ('partial', 'credit');