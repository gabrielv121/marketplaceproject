-- VRNA-owned inventory. One pool of 50 units per catalog product, sourced from trusted suppliers.
-- Buying this stock skips the peer seller shipment and lands the order ready to ship from VRNA.

create table if not exists public.platform_inventory (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  product_handle text not null unique,
  quantity_on_hand int not null default 50 check (quantity_on_hand >= 0),
  quantity_reserved int not null default 0 check (quantity_reserved >= 0),
  source text not null default 'trusted_supplier'
    check (source in ('trusted_supplier', 'certified_supplier'))
);

comment on table public.platform_inventory is
  'Platform-owned units. Available = quantity_on_hand - quantity_reserved. Source marks trusted/certified suppliers.';

alter table public.platform_inventory enable row level security;

alter table public.p2p_trades
  alter column seller_id drop not null;

alter table public.p2p_trades
  add column if not exists fulfillment_source text not null default 'peer'
    check (fulfillment_source in ('peer', 'platform'));

alter table public.p2p_trades
  add column if not exists platform_inventory_id uuid references public.platform_inventory (id);

alter table public.p2p_trades
  add column if not exists inventory_source text;

alter table public.p2p_trades
  add column if not exists inventory_committed boolean not null default false;

comment on column public.p2p_trades.fulfillment_source is
  'peer = seller ships to VRNA for verification. platform = VRNA inventory, already authenticated.';

insert into public.platform_inventory (product_handle, quantity_on_hand, quantity_reserved, source)
select c.handle, 50, 0, 'trusted_supplier'
from public.catalog_products c
on conflict (product_handle) do nothing;

create or replace function public.ensure_platform_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.platform_inventory (product_handle, quantity_on_hand, source)
  values (new.handle, 50, 'trusted_supplier')
  on conflict (product_handle) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_catalog_platform_inventory on public.catalog_products;
create trigger trg_catalog_platform_inventory
  after insert on public.catalog_products
  for each row
  execute function public.ensure_platform_inventory();

create or replace function public.platform_offer_price_cents(p_product_handle text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(100, round(coalesce(c.price_min, 1) * 100)::int)
  from public.catalog_products c
  where c.handle = p_product_handle
  limit 1;
$$;

create or replace function public.list_platform_offer(p_product_handle text)
returns table (
  product_handle text,
  quantity_available int,
  price_cents int,
  currency text,
  source text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.product_handle,
    greatest(i.quantity_on_hand - i.quantity_reserved, 0) as quantity_available,
    public.platform_offer_price_cents(i.product_handle) as price_cents,
    'USD'::text as currency,
    i.source
  from public.platform_inventory i
  where i.product_handle = p_product_handle;
$$;

create or replace function public.take_platform_inventory(
  p_product_handle text,
  p_size_label text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_inventory%rowtype;
  v_price int;
  v_trade_id uuid;
  v_size text := nullif(btrim(p_size_label), '');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  perform public.require_email_verified();

  if v_size is null then
    raise exception 'size_required';
  end if;

  select * into v_row
  from public.platform_inventory
  where product_handle = p_product_handle
  for update;

  if not found then
    raise exception 'platform_inventory_missing';
  end if;

  if v_row.quantity_on_hand - v_row.quantity_reserved < 1 then
    raise exception 'platform_out_of_stock';
  end if;

  v_price := public.platform_offer_price_cents(p_product_handle);
  if v_price is null or v_price <= 0 then
    raise exception 'platform_price_missing';
  end if;

  update public.platform_inventory
  set quantity_reserved = quantity_reserved + 1,
      updated_at = now()
  where id = v_row.id;

  insert into public.p2p_trades (
    listing_id,
    buyer_id,
    seller_id,
    product_handle,
    size_label,
    price_cents,
    currency,
    status,
    fulfillment_source,
    platform_inventory_id,
    inventory_source
  )
  values (
    null,
    auth.uid(),
    null,
    p_product_handle,
    v_size,
    v_price,
    'USD',
    'reserved',
    'platform',
    v_row.id,
    v_row.source
  )
  returning id into v_trade_id;

  return v_trade_id;
end;
$$;

create or replace function public.release_platform_inventory_reservation(p_inventory_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_inventory_id is null then
    return;
  end if;

  update public.platform_inventory
  set quantity_reserved = greatest(quantity_reserved - 1, 0),
      updated_at = now()
  where id = p_inventory_id;
end;
$$;

create or replace function public.commit_platform_inventory_sale(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory_id uuid;
begin
  update public.p2p_trades
  set inventory_committed = true
  where id = p_trade_id
    and fulfillment_source = 'platform'
    and inventory_committed = false
    and platform_inventory_id is not null
  returning platform_inventory_id into v_inventory_id;

  if not found then
    return;
  end if;

  update public.platform_inventory
  set quantity_on_hand = greatest(quantity_on_hand - 1, 0),
      quantity_reserved = greatest(quantity_reserved - 1, 0),
      updated_at = now()
  where id = v_inventory_id;
end;
$$;

create or replace function public.cancel_reserved_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid;
  v_inventory_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.p2p_trades t
  set status = 'cancelled'
  where t.id = p_trade_id
    and t.buyer_id = auth.uid()
    and t.status in ('reserved', 'pending_payment')
  returning t.listing_id, t.platform_inventory_id into v_listing_id, v_inventory_id;

  if not found then
    raise exception 'trade_not_releasable';
  end if;

  if v_listing_id is not null then
    update public.p2p_listings l
    set status = 'active'
    where l.id = v_listing_id
      and l.status = 'reserved';
  end if;

  perform public.release_platform_inventory_reservation(v_inventory_id);
end;
$$;

create or replace function public.expire_reserved_trade_by_session(p_stripe_checkout_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid;
  v_inventory_id uuid;
begin
  if p_stripe_checkout_session_id is null or btrim(p_stripe_checkout_session_id) = '' then
    return false;
  end if;

  update public.p2p_trades t
  set status = 'cancelled'
  where t.stripe_checkout_session_id = p_stripe_checkout_session_id
    and t.status in ('reserved', 'pending_payment')
  returning t.listing_id, t.platform_inventory_id into v_listing_id, v_inventory_id;

  if not found then
    return false;
  end if;

  if v_listing_id is not null then
    update public.p2p_listings l
    set status = 'active'
    where l.id = v_listing_id
      and l.status = 'reserved';
  end if;

  perform public.release_platform_inventory_reservation(v_inventory_id);
  return true;
end;
$$;

create or replace function public.cleanup_stale_reserved_trades(p_older_than interval default interval '30 minutes')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with stale as (
    update public.p2p_trades t
    set status = 'cancelled'
    where t.status in ('reserved', 'pending_payment')
      and t.created_at < now() - p_older_than
    returning t.listing_id, t.platform_inventory_id
  ),
  released as (
    update public.p2p_listings l
    set status = 'active'
    from stale
    where l.id = stale.listing_id
      and l.status = 'reserved'
    returning l.id
  ),
  stock as (
    update public.platform_inventory i
    set quantity_reserved = greatest(i.quantity_reserved - 1, 0),
        updated_at = now()
    from stale
    where i.id = stale.platform_inventory_id
    returning i.id
  )
  select count(*) into v_count from stale;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.list_platform_offer(text) from public;
grant execute on function public.list_platform_offer(text) to anon, authenticated;

revoke all on function public.take_platform_inventory(text, text) from public;
grant execute on function public.take_platform_inventory(text, text) to authenticated;

revoke all on function public.release_platform_inventory_reservation(uuid) from public;
grant execute on function public.release_platform_inventory_reservation(uuid) to service_role;

revoke all on function public.commit_platform_inventory_sale(uuid) from public;
grant execute on function public.commit_platform_inventory_sale(uuid) to service_role;

revoke all on function public.cancel_reserved_trade(uuid) from public;
grant execute on function public.cancel_reserved_trade(uuid) to authenticated;

revoke all on function public.expire_reserved_trade_by_session(text) from public;
grant execute on function public.expire_reserved_trade_by_session(text) to service_role;

revoke all on function public.cleanup_stale_reserved_trades(interval) from public;
grant execute on function public.cleanup_stale_reserved_trades(interval) to service_role;
