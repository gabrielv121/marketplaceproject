-- P2P marketplace: listings (asks), bids, trades. Public reads via SECURITY DEFINER RPCs
-- so order-book data does not expose buyer/seller identities to anonymous clients.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.p2p_listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  seller_id uuid not null references auth.users (id) on delete cascade,
  product_handle text not null,
  size_label text not null,
  shopify_variant_id text,
  price_cents int not null check (price_cents > 0),
  currency text not null default 'USD',
  status text not null default 'active' check (status in ('active', 'cancelled', 'sold'))
);

create index p2p_listings_handle_active on public.p2p_listings (product_handle, size_label)
  where status = 'active';

alter table public.p2p_listings enable row level security;

create policy "listings_insert_seller"
  on public.p2p_listings for insert
  with check (auth.uid() = seller_id);

create policy "listings_select_own"
  on public.p2p_listings for select
  using (auth.uid() = seller_id);

create policy "listings_update_own"
  on public.p2p_listings for update
  using (auth.uid() = seller_id);

create table public.p2p_bids (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  buyer_id uuid not null references auth.users (id) on delete cascade,
  product_handle text not null,
  size_label text not null,
  max_price_cents int not null check (max_price_cents > 0),
  currency text not null default 'USD',
  status text not null default 'open' check (status in ('open', 'cancelled', 'filled'))
);

create index p2p_bids_handle_open on public.p2p_bids (product_handle, size_label)
  where status = 'open';

alter table public.p2p_bids enable row level security;

create policy "bids_insert_buyer"
  on public.p2p_bids for insert
  with check (auth.uid() = buyer_id);

create policy "bids_select_own"
  on public.p2p_bids for select
  using (auth.uid() = buyer_id);

create policy "bids_update_own"
  on public.p2p_bids for update
  using (auth.uid() = buyer_id);

create table public.p2p_trades (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  listing_id uuid references public.p2p_listings (id),
  buyer_id uuid not null references auth.users (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,
  product_handle text not null,
  size_label text not null,
  price_cents int not null,
  currency text not null default 'USD',
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'completed', 'cancelled'))
);

create index p2p_trades_handle on public.p2p_trades (product_handle);

alter table public.p2p_trades enable row level security;

create policy "trades_select_parties"
  on public.p2p_trades for select
  using (auth.uid() = buyer_id or auth.uid() = seller_id);

-- Inserts into p2p_trades are performed only inside take_listing (security definer).
-- No insert policy for authenticated clients.

-- Public order book: no buyer/seller columns.
create or replace function public.list_active_listings(p_product_handle text)
returns table (
  id uuid,
  created_at timestamptz,
  size_label text,
  shopify_variant_id text,
  price_cents int,
  currency text
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.created_at, l.size_label, l.shopify_variant_id, l.price_cents, l.currency
  from public.p2p_listings l
  where l.product_handle = p_product_handle
    and l.status = 'active'
  order by l.price_cents asc, l.created_at asc;
$$;

create or replace function public.list_open_bids(p_product_handle text)
returns table (
  id uuid,
  created_at timestamptz,
  size_label text,
  max_price_cents int,
  currency text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.created_at, b.size_label, b.max_price_cents, b.currency
  from public.p2p_bids b
  where b.product_handle = p_product_handle
    and b.status = 'open'
  order by b.max_price_cents desc, b.created_at asc;
$$;

create or replace function public.list_recent_sales(p_product_handle text, p_limit int default 50)
returns table (
  size_label text,
  price_cents int,
  currency text,
  sold_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select t.size_label, t.price_cents, t.currency, t.created_at as sold_at
  from public.p2p_trades t
  where t.product_handle = p_product_handle
    and t.status = 'completed'
  order by t.created_at desc
  limit greatest(1, least(p_limit, 200));
$$;

create or replace function public.take_listing(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.p2p_listings%rowtype;
  v_trade_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row
  from public.p2p_listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'listing_not_found';
  end if;

  if v_row.status <> 'active' then
    raise exception 'listing_unavailable';
  end if;

  if v_row.seller_id = auth.uid() then
    raise exception 'cannot_buy_own_listing';
  end if;

  update public.p2p_listings
  set status = 'sold'
  where id = p_listing_id;

  insert into public.p2p_trades (
    listing_id, buyer_id, seller_id, product_handle, size_label, price_cents, currency, status
  )
  values (
    p_listing_id,
    auth.uid(),
    v_row.seller_id,
    v_row.product_handle,
    v_row.size_label,
    v_row.price_cents,
    v_row.currency,
    'pending_payment'
  )
  returning id into v_trade_id;

  return v_trade_id;
end;
$$;

create or replace function public.cancel_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select seller_id into v_seller
  from public.p2p_listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'listing_not_found';
  end if;

  if v_seller <> auth.uid() then
    raise exception 'forbidden';
  end if;

  update public.p2p_listings
  set status = 'cancelled'
  where id = p_listing_id and status = 'active';
end;
$$;

revoke all on function public.list_active_listings(text) from public;
grant execute on function public.list_active_listings(text) to anon, authenticated;

revoke all on function public.list_open_bids(text) from public;
grant execute on function public.list_open_bids(text) to anon, authenticated;

revoke all on function public.list_recent_sales(text, int) from public;
grant execute on function public.list_recent_sales(text, int) to anon, authenticated;

revoke all on function public.take_listing(uuid) from public;
grant execute on function public.take_listing(uuid) to authenticated;

revoke all on function public.cancel_listing(uuid) from public;
grant execute on function public.cancel_listing(uuid) to authenticated;
