
-- Add GST inclusive pricing flag to companies
ALTER TABLE public.companies ADD COLUMN gst_inclusive boolean NOT NULL DEFAULT false;
