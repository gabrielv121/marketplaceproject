-- Soft email verification: browse/sign-in without confirm; verify before buy/bid/list.
-- Dashboard: Authentication → Providers → Email → turn Confirm email OFF.

alter table public.profiles
  add column if not exists email_verified boolean not null default false;

alter table public.profiles
  add column if not exists email_verify_token text;

alter table public.profiles
  add column if not exists email_verify_token_expires_at timestamptz;

comment on column public.profiles.email_verified is
  'App-level email verification. Required for buy, bid, and list. Independent of Supabase Auth confirm-email.';

create unique index if not exists profiles_email_verify_token_uidx
  on public.profiles (email_verify_token)
  where email_verify_token is not null;

-- Existing accounts were already able to trade under the old confirm-email flow.
update public.profiles
set email_verified = true
where email_verified = false;

create or replace function public.require_email_verified()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not coalesce(
    (select p.email_verified from public.profiles p where p.id = auth.uid()),
    false
  ) then
    raise exception 'email_not_verified';
  end if;
end;
$$;

revoke all on function public.require_email_verified() from public;
grant execute on function public.require_email_verified() to authenticated;

create or replace function public.confirm_email_verification(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'invalid_verify_token';
  end if;

  update public.profiles
  set
    email_verified = true,
    email_verify_token = null,
    email_verify_token_expires_at = null
  where id = v_uid
    and email_verify_token = trim(p_token)
    and email_verify_token_expires_at is not null
    and email_verify_token_expires_at > now();

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    if exists (select 1 from public.profiles p where p.id = v_uid and p.email_verified) then
      return true;
    end if;
    raise exception 'invalid_or_expired_verify_token';
  end if;

  return true;
end;
$$;

revoke all on function public.confirm_email_verification(text) from public;
grant execute on function public.confirm_email_verification(text) to authenticated;

-- Block listing inserts when email is not verified (direct table insert path).
create or replace function public.enforce_listing_email_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(
    (select p.email_verified from public.profiles p where p.id = new.seller_id),
    false
  ) then
    raise exception 'email_not_verified';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_p2p_listings_email_verified on public.p2p_listings;
create trigger trg_p2p_listings_email_verified
  before insert on public.p2p_listings
  for each row
  execute function public.enforce_listing_email_verified();

-- Gate take_listing (buy).
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

  perform public.require_email_verified();

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

-- Gate place_bid.
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

  perform public.require_email_verified();

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

-- Gate update_bid.
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

  perform public.require_email_verified();

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
