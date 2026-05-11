
-- Allow admins to read, insert, and update any walkthrough photo so they can
-- fix incomplete walkthroughs on behalf of agents and re-upload to Drive.
CREATE POLICY "Admins can read any walkthrough photo"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'walkthrough-photos' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert any walkthrough photo"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'walkthrough-photos' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can update any walkthrough photo"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'walkthrough-photos' AND public.is_admin(auth.uid()))
WITH CHECK (bucket_id = 'walkthrough-photos' AND public.is_admin(auth.uid()));
