-- Release unpaid reservations when a buyer cancels Checkout or a Checkout Session expires.

create or replace function public.cancel_reserved_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.p2p_trades t
  set status = 'cancelled'
  where t.id = p_trade_id
    and t.buyer_id = auth.uid()
    and t.status in ('reserved', 'pending_payment')
  returning t.listing_id into v_listing_id;

  if not found then
    raise exception 'trade_not_releasable';
  end if;

  if v_listing_id is not null then
    update public.p2p_listings l
    set status = 'active'
    where l.id = v_listing_id
      and l.status = 'reserved';
  end if;
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
begin
  if p_stripe_checkout_session_id is null or btrim(p_stripe_checkout_session_id) = '' then
    return false;
  end if;

  update public.p2p_trades t
  set status = 'cancelled'
  where t.stripe_checkout_session_id = p_stripe_checkout_session_id
    and t.status in ('reserved', 'pending_payment')
  returning t.listing_id into v_listing_id;

  if not found then
    return false;
  end if;

  if v_listing_id is not null then
    update public.p2p_listings l
    set status = 'active'
    where l.id = v_listing_id
      and l.status = 'reserved';
  end if;

  return true;
end;
$$;

revoke all on function public.cancel_reserved_trade(uuid) from public;
grant execute on function public.cancel_reserved_trade(uuid) to authenticated;

revoke all on function public.expire_reserved_trade_by_session(text) from public;
grant execute on function public.expire_reserved_trade_by_session(text) to service_role;
