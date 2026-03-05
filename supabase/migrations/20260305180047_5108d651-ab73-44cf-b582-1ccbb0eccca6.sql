
-- Create storage bucket for invoice uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoices', 'invoices', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to invoices bucket
CREATE POLICY "Authenticated users can upload invoices"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'invoices');

-- Allow authenticated users to read their uploaded invoices
CREATE POLICY "Authenticated users can read invoices"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'invoices');
