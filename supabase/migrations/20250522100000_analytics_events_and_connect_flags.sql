-- Analytics event collection + Stripe Connect status cache on profiles.

alter table public.profiles
  add column if not exists stripe_charges_enabled boolean,
  add column if not exists stripe_payouts_enabled boolean,
  add column if not exists stripe_details_submitted boolean,
  add column if not exists stripe_connect_updated_at timestamptz;

comment on column public.profiles.stripe_charges_enabled is 'Cached Stripe Connect charges_enabled.';
comment on column public.profiles.stripe_payouts_enabled is 'Cached Stripe Connect payouts_enabled.';
comment on column public.profiles.stripe_details_submitted is 'Cached Stripe Connect details_submitted.';
comment on column public.profiles.stripe_connect_updated_at is 'When Connect capability flags were last synced from Stripe.';

create table if not exists public.search_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  query text not null,
  result_count int not null default 0 check (result_count >= 0),
  clicked_handle text,
  path text
);

create index if not exists search_events_created_at_idx on public.search_events (created_at desc);
create index if not exists search_events_query_idx on public.search_events (lower(query));

alter table public.search_events enable row level security;

drop policy if exists search_events_insert on public.search_events;
create policy search_events_insert
  on public.search_events for insert
  to anon, authenticated
  with check (user_id is null or auth.uid() = user_id);

create table if not exists public.product_views (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  product_handle text not null,
  path text
);

create index if not exists product_views_created_at_idx on public.product_views (created_at desc);
create index if not exists product_views_handle_idx on public.product_views (product_handle);

alter table public.product_views enable row level security;

drop policy if exists product_views_insert on public.product_views;
create policy product_views_insert
  on public.product_views for insert
  to anon, authenticated
  with check (user_id is null or auth.uid() = user_id);

grant insert on public.search_events to anon, authenticated;
grant insert on public.product_views to anon, authenticated;
