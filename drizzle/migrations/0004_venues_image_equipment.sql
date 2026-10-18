ALTER TABLE public.venues ADD COLUMN image_url text;
ALTER TABLE public.venues ADD COLUMN equipment text[] NOT NULL DEFAULT '{}';

CREATE POLICY "venue images public read"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'venue-images');

CREATE POLICY "admins manage venue images"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'venue-images' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'venue-images' AND public.has_role(auth.uid(), 'admin'));