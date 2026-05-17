-- Marketplace core: raise bids, one open bid per size, reopen bids when checkout expires.

create or replace function public.reopen_bid_after_trade_cancel(p_bid_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_bid_id is null then
    return;
  end if;

  update public.p2p_bids
  set status = 'open'
  where id = p_bid_id
    and status = 'filled';
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
  v_bid_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.p2p_trades t
  set status = 'cancelled'
  where t.id = p_trade_id
    and t.buyer_id = auth.uid()
    and t.status in ('reserved', 'pending_payment')
  returning t.listing_id, t.bid_id into v_listing_id, v_bid_id;

  if not found then
    raise exception 'trade_not_releasable';
  end if;

  if v_listing_id is not null then
    update public.p2p_listings l
    set status = 'active'
    where l.id = v_listing_id
      and l.status = 'reserved';
  end if;

  perform public.reopen_bid_after_trade_cancel(v_bid_id);
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
  v_bid_id uuid;
begin
  if p_stripe_checkout_session_id is null or btrim(p_stripe_checkout_session_id) = '' then
    return false;
  end if;

  update public.p2p_trades t
  set status = 'cancelled'
  where t.stripe_checkout_session_id = p_stripe_checkout_session_id
    and t.status in ('reserved', 'pending_payment')
  returning t.listing_id, t.bid_id into v_listing_id, v_bid_id;

  if not found then
    return false;
  end if;

  if v_listing_id is not null then
    update public.p2p_listings l
    set status = 'active'
    where l.id = v_listing_id
      and l.status = 'reserved';
  end if;

  perform public.reopen_bid_after_trade_cancel(v_bid_id);
  return true;
end;
$$;

create or replace function public.cleanup_stale_reserved_trades(p_older_than interval default interval '35 minutes')
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
    returning t.listing_id, t.bid_id
  ),
  reopened as (
    update public.p2p_bids b
    set status = 'open'
    from stale s
    where b.id = s.bid_id
      and b.status = 'filled'
    returning b.id
  ),
  released as (
    update public.p2p_listings l
    set status = 'active'
    from stale s
    where l.id = s.listing_id
      and l.status = 'reserved'
    returning l.id
  )
  select count(*) into v_count from stale;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.place_bid(
  p_product_handle text,
  p_size_label text,
  p_max_price_cents int,
  p_currency text default 'USD'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_bid_id uuid;
  v_listing public.p2p_listings%rowtype;
  v_trade_id uuid;
begin
  if v_buyer is null then
    raise exception 'not_authenticated';
  end if;

  if p_max_price_cents is null or p_max_price_cents <= 0 then
    raise exception 'invalid_price';
  end if;

  if exists (
    select 1
    from public.p2p_bids b
    where b.buyer_id = v_buyer
      and b.product_handle = p_product_handle
      and b.size_label = p_size_label
      and b.status = 'open'
  ) then
    raise exception 'bid_already_open';
  end if;

  insert into public.p2p_bids (buyer_id, product_handle, size_label, max_price_cents, currency)
  values (v_buyer, p_product_handle, p_size_label, p_max_price_cents, coalesce(nullif(trim(p_currency), ''), 'USD'))
  returning id into v_bid_id;

  select * into v_listing
  from public.p2p_listings l
  where l.product_handle = p_product_handle
    and l.size_label = p_size_label
    and l.status = 'active'
    and l.price_cents <= p_max_price_cents
    and l.seller_id <> v_buyer
  order by l.price_cents asc, l.created_at asc
  limit 1
  for update;

  if found then
    update public.p2p_listings
    set status = 'reserved'
    where id = v_listing.id;

    update public.p2p_bids
    set status = 'filled'
    where id = v_bid_id;

    insert into public.p2p_trades (
      listing_id,
      bid_id,
      buyer_id,
      seller_id,
      product_handle,
      size_label,
      price_cents,
      currency,
      status
    )
    values (
      v_listing.id,
      v_bid_id,
      v_buyer,
      v_listing.seller_id,
      v_listing.product_handle,
      v_listing.size_label,
      v_listing.price_cents,
      v_listing.currency,
      'reserved'
    )
    returning id into v_trade_id;

    return jsonb_build_object(
      'bid_id', v_bid_id,
      'matched', true,
      'trade_id', v_trade_id,
      'match_price_cents', v_listing.price_cents
    );
  end if;

  return jsonb_build_object(
    'bid_id', v_bid_id,
    'matched', false,
    'trade_id', null,
    'match_price_cents', null
  );
end;
$$;

create or replace function public.update_bid(p_bid_id uuid, p_max_price_cents int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_bid public.p2p_bids%rowtype;
  v_listing public.p2p_listings%rowtype;
  v_trade_id uuid;
begin
  if v_buyer is null then
    raise exception 'not_authenticated';
  end if;

  if p_max_price_cents is null or p_max_price_cents <= 0 then
    raise exception 'invalid_price';
  end if;

  select * into v_bid
  from public.p2p_bids b
  where b.id = p_bid_id
    and b.buyer_id = v_buyer
    and b.status = 'open'
  for update;

  if not found then
    raise exception 'bid_not_updatable';
  end if;

  if p_max_price_cents <= v_bid.max_price_cents then
    raise exception 'bid_must_increase';
  end if;

  update public.p2p_bids
  set max_price_cents = p_max_price_cents
  where id = v_bid.id;

  select * into v_listing
  from public.p2p_listings l
  where l.product_handle = v_bid.product_handle
    and l.size_label = v_bid.size_label
    and l.status = 'active'
    and l.price_cents <= p_max_price_cents
    and l.seller_id <> v_buyer
  order by l.price_cents asc, l.created_at asc
  limit 1
  for update;

  if found then
    update public.p2p_listings
    set status = 'reserved'
    where id = v_listing.id;

    update public.p2p_bids
    set status = 'filled'
    where id = v_bid.id;

    insert into public.p2p_trades (
      listing_id,
      bid_id,
      buyer_id,
      seller_id,
      product_handle,
      size_label,
      price_cents,
      currency,
      status
    )
    values (
      v_listing.id,
      v_bid.id,
      v_buyer,
      v_listing.seller_id,
      v_listing.product_handle,
      v_listing.size_label,
      v_listing.price_cents,
      v_listing.currency,
      'reserved'
    )
    returning id into v_trade_id;

    return jsonb_build_object(
      'bid_id', v_bid.id,
      'matched', true,
      'trade_id', v_trade_id,
      'match_price_cents', v_listing.price_cents
    );
  end if;

  return jsonb_build_object(
    'bid_id', v_bid.id,
    'matched', false,
    'trade_id', null,
    'match_price_cents', null
  );
end;
$$;

revoke all on function public.reopen_bid_after_trade_cancel(uuid) from public;
revoke all on function public.update_bid(uuid, int) from public;
grant execute on function public.update_bid(uuid, int) to authenticated;

-- Schedule stale checkout cleanup when pg_cron is available (Supabase Pro+).
do $schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'cleanup-stale-reserved-trades';

    perform cron.schedule(
      'cleanup-stale-reserved-trades',
      '*/15 * * * *',
      $$select public.cleanup_stale_reserved_trades(interval '35 minutes');$$
    );
  end if;
exception
  when others then
    raise notice 'pg_cron schedule skipped: %', sqlerrm;
end;
$schedule$;
