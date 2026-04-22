-- Profiles table (one row per auth user)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  license_number text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by owner"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Profiles are insertable by owner"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Profiles are updatable by owner"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Profiles are deletable by owner"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = id);

-- Trigger to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Walkthroughs: one row per property walkthrough, owned by an agent
create table public.walkthroughs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  house_number text not null default '',
  street_name text not null default '',
  city text not null default '',
  config jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  last_route text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index walkthroughs_user_id_idx on public.walkthroughs(user_id);
create index walkthroughs_user_updated_idx on public.walkthroughs(user_id, updated_at desc);

alter table public.walkthroughs enable row level security;

create policy "Walkthroughs are viewable by owner"
  on public.walkthroughs for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Walkthroughs are insertable by owner"
  on public.walkthroughs for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Walkthroughs are updatable by owner"
  on public.walkthroughs for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Walkthroughs are deletable by owner"
  on public.walkthroughs for delete
  to authenticated
  using (auth.uid() = user_id);

create trigger walkthroughs_set_updated_at
before update on public.walkthroughs
for each row execute function public.set_updated_at();

-- Public-readable avatar bucket; users can only write to their own folder
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly viewable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );