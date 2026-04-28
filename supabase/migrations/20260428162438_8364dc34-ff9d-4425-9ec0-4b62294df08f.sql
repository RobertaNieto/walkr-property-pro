
-- Add upload tracking fields to walkthroughs
ALTER TABLE public.walkthroughs
  ADD COLUMN IF NOT EXISTS upload_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS drive_folder_url text,
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;

-- Validate upload_status values via trigger (avoid CHECK to keep flexibility)
CREATE OR REPLACE FUNCTION public.validate_walkthrough_upload_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.upload_status NOT IN ('pending','uploading','confirmed','failed') THEN
    RAISE EXCEPTION 'Invalid upload_status: %', NEW.upload_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_walkthrough_upload_status_trg ON public.walkthroughs;
CREATE TRIGGER validate_walkthrough_upload_status_trg
BEFORE INSERT OR UPDATE OF upload_status ON public.walkthroughs
FOR EACH ROW EXECUTE FUNCTION public.validate_walkthrough_upload_status();

-- Private storage bucket for walkthrough photos awaiting Drive upload
INSERT INTO storage.buckets (id, name, public)
VALUES ('walkthrough-photos', 'walkthrough-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Users can manage only files inside a folder named after their user_id
CREATE POLICY "Users can read their own walkthrough photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'walkthrough-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own walkthrough photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'walkthrough-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own walkthrough photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'walkthrough-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own walkthrough photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'walkthrough-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
