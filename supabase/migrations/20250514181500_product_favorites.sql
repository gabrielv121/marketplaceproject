-- Product favorites saved by each user.

create table if not exists public.product_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_handle text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, product_handle)
);

create index if not exists product_favorites_user_created_idx
  on public.product_favorites (user_id, created_at desc);

alter table public.product_favorites enable row level security;

drop policy if exists "favorites_select_own" on public.product_favorites;
create policy "favorites_select_own"
  on public.product_favorites for select
  using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.product_favorites;
create policy "favorites_insert_own"
  on public.product_favorites for insert
  with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.product_favorites;
create policy "favorites_delete_own"
  on public.product_favorites for delete
  using (auth.uid() = user_id);
