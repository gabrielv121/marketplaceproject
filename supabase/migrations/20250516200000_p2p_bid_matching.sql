-- Bid matching: cancel, auto-match on place, seller sell to highest bid.

alter table public.p2p_trades
  add column if not exists bid_id uuid references public.p2p_bids (id) on delete set null;

create index if not exists p2p_trades_bid_id_idx on public.p2p_trades (bid_id) where bid_id is not null;

create or replace function public.cancel_bid(p_bid_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.p2p_bids
  set status = 'cancelled'
  where id = p_bid_id
    and buyer_id = auth.uid()
    and status = 'open';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'bid_not_cancellable';
  end if;
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

create or replace function public.sell_listing_to_bid(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid := auth.uid();
  v_listing public.p2p_listings%rowtype;
  v_bid public.p2p_bids%rowtype;
  v_trade_id uuid;
begin
  if v_seller is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_listing
  from public.p2p_listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'listing_not_found';
  end if;

  if v_listing.seller_id <> v_seller then
    raise exception 'forbidden';
  end if;

  if v_listing.status <> 'active' then
    raise exception 'listing_unavailable';
  end if;

  select * into v_bid
  from public.p2p_bids b
  where b.product_handle = v_listing.product_handle
    and b.size_label = v_listing.size_label
    and b.status = 'open'
    and b.max_price_cents >= v_listing.price_cents
    and b.buyer_id <> v_seller
  order by b.max_price_cents desc, b.created_at asc
  limit 1
  for update;

  if not found then
    raise exception 'no_matching_bid';
  end if;

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
    v_bid.buyer_id,
    v_seller,
    v_listing.product_handle,
    v_listing.size_label,
    v_listing.price_cents,
    v_listing.currency,
    'reserved'
  )
  returning id into v_trade_id;

  return v_trade_id;
end;
$$;

revoke all on function public.cancel_bid(uuid) from public;
grant execute on function public.cancel_bid(uuid) to authenticated;

revoke all on function public.place_bid(text, text, int, text) from public;
grant execute on function public.place_bid(text, text, int, text) to authenticated;

revoke all on function public.sell_listing_to_bid(uuid) from public;
grant execute on function public.sell_listing_to_bid(uuid) to authenticated;
