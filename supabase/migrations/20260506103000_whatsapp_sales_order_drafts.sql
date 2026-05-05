-- WhatsApp/chat to sales-order draft support.
-- Drafts are published as pending sales orders. Staff still confirms from Sales
-- after stock, batch, and prescription checks.

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS prescription_image_url text,
  ADD COLUMN IF NOT EXISTS automation_source text,
  ADD COLUMN IF NOT EXISTS automation_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'prescriptions',
  'prescriptions',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Company members read own prescription files" ON storage.objects;
DROP POLICY IF EXISTS "Company members upload own prescription files" ON storage.objects;
DROP POLICY IF EXISTS "Company members update own prescription files" ON storage.objects;
DROP POLICY IF EXISTS "Company members delete own prescription files" ON storage.objects;

CREATE POLICY "Company members read own prescription files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND (storage.foldername(name))[1] = (public.get_user_company_id(auth.uid()))::text
);

CREATE POLICY "Company members upload own prescription files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'prescriptions'
  AND (storage.foldername(name))[1] = (public.get_user_company_id(auth.uid()))::text
);

CREATE POLICY "Company members update own prescription files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND (storage.foldername(name))[1] = (public.get_user_company_id(auth.uid()))::text
)
WITH CHECK (
  bucket_id = 'prescriptions'
  AND (storage.foldername(name))[1] = (public.get_user_company_id(auth.uid()))::text
);

CREATE POLICY "Company members delete own prescription files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND (storage.foldername(name))[1] = (public.get_user_company_id(auth.uid()))::text
);
