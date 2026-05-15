-- Payment lifecycle hardening:
-- - reserve listings while Checkout is pending instead of marking them sold immediately
-- - mark trades paid when Stripe confirms payment; keep completed for post-payment fulfillment
-- - provide a cleanup RPC to release stale reservations

alter table public.p2p_listings
  drop constraint if exists p2p_listings_status_check;

alter table public.p2p_listings
  add constraint p2p_listings_status_check
  check (status in ('active', 'reserved', 'cancelled', 'sold'));

alter table public.p2p_trades
  drop constraint if exists p2p_trades_status_check;

alter table public.p2p_trades
  add constraint p2p_trades_status_check
  check (status in ('reserved', 'pending_payment', 'paid', 'completed', 'cancelled'));

-- Normalize old rows that were created before the reservation state existed.
update public.p2p_trades
set status = 'reserved'
where status = 'pending_payment';

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
  set status = 'reserved'
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
    'reserved'
  )
  returning id into v_trade_id;

  return v_trade_id;
end;
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
    and t.status in ('paid', 'completed')
  order by t.created_at desc
  limit greatest(1, least(p_limit, 200));
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
    returning t.listing_id
  ),
  released as (
    update public.p2p_listings l
    set status = 'active'
    from stale
    where l.id = stale.listing_id
      and l.status = 'reserved'
    returning l.id
  )
  select count(*) into v_count from stale;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.take_listing(uuid) from public;
grant execute on function public.take_listing(uuid) to authenticated;

revoke all on function public.list_recent_sales(text, int) from public;
grant execute on function public.list_recent_sales(text, int) to anon, authenticated;

revoke all on function public.cleanup_stale_reserved_trades(interval) from public;
grant execute on function public.cleanup_stale_reserved_trades(interval) to service_role;
-- Do not grant this cleanup function to anon/authenticated clients. Call it only with service role.
