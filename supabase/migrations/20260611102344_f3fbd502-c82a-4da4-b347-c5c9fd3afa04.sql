
CREATE POLICY "Company members can upload invoice attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'invoice-attachments'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Company members can read invoice attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'invoice-attachments'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Company members can update invoice attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'invoice-attachments'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);
