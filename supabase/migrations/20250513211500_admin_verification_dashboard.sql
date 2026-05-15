-- Admin verification dashboard support.
-- Mark trusted users as admins with:
--   update public.profiles set is_admin = true where id = '<your-user-uuid>';

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is 'Allows access to internal EXCH. verification dashboard RPCs.';

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  );
$$;

create or replace function public.admin_list_verification_trades()
returns table (
  id uuid,
  created_at timestamptz,
  buyer_id uuid,
  seller_id uuid,
  buyer_email text,
  seller_email text,
  product_handle text,
  size_label text,
  price_cents int,
  currency text,
  status text,
  paid_at timestamptz,
  seller_ship_by timestamptz,
  seller_shipped_at timestamptz,
  received_by_exch_at timestamptz,
  verified_at timestamptz,
  shipped_to_buyer_at timestamptz,
  delivered_to_buyer_at timestamptz,
  payout_available_at timestamptz,
  payout_paid_at timestamptz,
  refunded_at timestamptz,
  seller_tracking_number text,
  buyer_tracking_number text,
  verification_notes text,
  buyer_shipping_cents int,
  seller_inbound_label_cents int,
  seller_fee_cents int,
  seller_net_payout_cents int,
  buyer_total_cents int,
  seller_label_url text,
  seller_label_carrier text,
  seller_label_service text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    t.id,
    t.created_at,
    t.buyer_id,
    t.seller_id,
    buyer.email::text as buyer_email,
    seller.email::text as seller_email,
    t.product_handle,
    t.size_label,
    t.price_cents,
    t.currency,
    t.status,
    t.paid_at,
    t.seller_ship_by,
    t.seller_shipped_at,
    t.received_by_exch_at,
    t.verified_at,
    t.shipped_to_buyer_at,
    t.delivered_to_buyer_at,
    t.payout_available_at,
    t.payout_paid_at,
    t.refunded_at,
    t.seller_tracking_number,
    t.buyer_tracking_number,
    t.verification_notes,
    t.buyer_shipping_cents,
    t.seller_inbound_label_cents,
    t.seller_fee_cents,
    t.seller_net_payout_cents,
    t.buyer_total_cents,
    t.seller_label_url,
    t.seller_label_carrier,
    t.seller_label_service
  from public.p2p_trades t
  left join auth.users buyer on buyer.id = t.buyer_id
  left join auth.users seller on seller.id = t.seller_id
  where t.status not in ('reserved', 'pending_payment', 'cancelled')
  order by t.created_at desc;
end;
$$;

create or replace function public.admin_update_trade_status(
  p_trade_id uuid,
  p_status text,
  p_verification_notes text default null,
  p_seller_tracking_number text default null,
  p_buyer_tracking_number text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  if p_status not in (
    'seller_notified',
    'seller_shipped_to_exch',
    'received_by_exch',
    'verification_passed',
    'verification_failed',
    'shipped_to_buyer',
    'delivered_to_buyer',
    'payout_available',
    'payout_paid',
    'payout_failed',
    'completed',
    'refunded'
  ) then
    raise exception 'invalid_trade_status';
  end if;

  update public.p2p_trades
  set
    status = p_status,
    verification_notes = coalesce(nullif(btrim(p_verification_notes), ''), verification_notes),
    seller_tracking_number = coalesce(nullif(btrim(p_seller_tracking_number), ''), seller_tracking_number),
    buyer_tracking_number = coalesce(nullif(btrim(p_buyer_tracking_number), ''), buyer_tracking_number),
    seller_shipped_at = case when p_status = 'seller_shipped_to_exch' then coalesce(seller_shipped_at, now()) else seller_shipped_at end,
    received_by_exch_at = case when p_status = 'received_by_exch' then coalesce(received_by_exch_at, now()) else received_by_exch_at end,
    verified_at = case when p_status in ('verification_passed', 'verification_failed') then coalesce(verified_at, now()) else verified_at end,
    shipped_to_buyer_at = case when p_status = 'shipped_to_buyer' then coalesce(shipped_to_buyer_at, now()) else shipped_to_buyer_at end,
    delivered_to_buyer_at = case when p_status = 'delivered_to_buyer' then coalesce(delivered_to_buyer_at, now()) else delivered_to_buyer_at end,
    payout_available_at = case when p_status = 'payout_available' then coalesce(payout_available_at, now()) else payout_available_at end,
    payout_paid_at = case when p_status = 'payout_paid' then coalesce(payout_paid_at, now()) else payout_paid_at end,
    refunded_at = case when p_status = 'refunded' then coalesce(refunded_at, now()) else refunded_at end
  where id = p_trade_id
    and status not in ('reserved', 'pending_payment', 'cancelled');

  if not found then
    raise exception 'trade_not_found';
  end if;
end;
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;

revoke all on function public.admin_list_verification_trades() from public;
grant execute on function public.admin_list_verification_trades() to authenticated;

revoke all on function public.admin_update_trade_status(uuid, text, text, text, text) from public;
grant execute on function public.admin_update_trade_status(uuid, text, text, text, text) to authenticated;
