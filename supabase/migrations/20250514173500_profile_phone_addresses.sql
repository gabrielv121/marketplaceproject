-- Persist account contact details and reusable shipping addresses.

alter table public.profiles
  add column if not exists phone text;

create table if not exists public.profile_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  label text not null default 'Home',
  name text not null default '',
  line1 text not null default '',
  line2 text not null default '',
  city text not null default '',
  region text not null default '',
  postal text not null default '',
  country text not null default 'US',
  is_default boolean not null default false
);

create index if not exists profile_addresses_user_idx
  on public.profile_addresses (user_id, created_at desc);

create unique index if not exists profile_addresses_one_default_idx
  on public.profile_addresses (user_id)
  where is_default;

alter table public.profile_addresses enable row level security;

drop policy if exists "profile_addresses_select_own" on public.profile_addresses;
create policy "profile_addresses_select_own"
  on public.profile_addresses for select
  using (auth.uid() = user_id);

drop policy if exists "profile_addresses_insert_own" on public.profile_addresses;
create policy "profile_addresses_insert_own"
  on public.profile_addresses for insert
  with check (auth.uid() = user_id);

drop policy if exists "profile_addresses_update_own" on public.profile_addresses;
create policy "profile_addresses_update_own"
  on public.profile_addresses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "profile_addresses_delete_own" on public.profile_addresses;
create policy "profile_addresses_delete_own"
  on public.profile_addresses for delete
  using (auth.uid() = user_id);
