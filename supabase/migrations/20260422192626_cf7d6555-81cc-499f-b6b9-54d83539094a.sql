-- Fix function search_path warning
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Replace broad public-list policy with name-scoped read.
-- Public users can still GET avatars by direct path (since the bucket is public),
-- but cannot list everyone's files via the storage API.
drop policy if exists "Avatar images are publicly viewable" on storage.objects;

create policy "Users can view their own avatar via list"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );