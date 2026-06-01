ALTER TABLE public.walkthroughs
  ADD COLUMN IF NOT EXISTS stories text,
  ADD COLUMN IF NOT EXISTS fenced_yard boolean,
  ADD COLUMN IF NOT EXISTS fence_type text,
  ADD COLUMN IF NOT EXISTS street_noise text;