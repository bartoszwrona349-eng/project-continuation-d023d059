DROP POLICY "venue images public read" ON storage.objects;

CREATE POLICY "venue images authenticated read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'venue-images');