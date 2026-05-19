-- Each party only sees their own shipment tracking (seller→EXCH. vs EXCH.→buyer).

create or replace function public.get_trade_for_participant(p_trade_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_row public.p2p_trades%rowtype;
  v_out jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row
  from public.p2p_trades t
  where t.id = p_trade_id;

  if not found then
    return null;
  end if;

  if v_row.buyer_id = v_uid then
    v_role := 'buyer';
  elsif v_row.seller_id = v_uid then
    v_role := 'seller';
  else
    raise exception 'forbidden';
  end if;

  v_out := to_jsonb(v_row);
  v_out := v_out - 'buyer_id' - 'seller_id';

  if v_role = 'seller' then
    v_out := v_out
      || jsonb_build_object(
        'buyer_shipping_name', null,
        'buyer_shipping_email', null,
        'buyer_shipping_phone', null,
        'buyer_shipping_line1', null,
        'buyer_shipping_line2', null,
        'buyer_shipping_city', null,
        'buyer_shipping_state', null,
        'buyer_shipping_postal_code', null,
        'buyer_shipping_country', null,
        'buyer_label_url', null,
        'buyer_label_carrier', null,
        'buyer_label_service', null,
        'buyer_tracking_number', null,
        'stripe_checkout_session_id', null,
        'stripe_charge_id', null
      );
  else
    v_out := v_out
      || jsonb_build_object(
        'seller_label_url', null,
        'seller_label_id', null,
        'seller_label_rate_id', null,
        'seller_label_provider', null,
        'seller_label_carrier', null,
        'seller_label_service', null,
        'seller_tracking_number', null,
        'seller_inbound_label_cents', null,
        'seller_fee_bps', null,
        'seller_fee_cents', null,
        'seller_net_payout_cents', null,
        'stripe_transfer_id', null,
        'stripe_transfer_amount_cents', null,
        'stripe_transfer_error', null,
        'stripe_charge_id', null
      );
  end if;

  return v_out || jsonb_build_object('role', v_role, 'access', 'participant');
end;
$$;

create or replace function public.list_my_trades()
returns table (
  id uuid,
  created_at timestamptz,
  product_handle text,
  size_label text,
  price_cents int,
  currency text,
  status text,
  stripe_checkout_session_id text,
  buyer_shipping_cents int,
  buyer_processing_fee_cents int,
  buyer_total_cents int,
  seller_inbound_label_cents int,
  seller_fee_cents int,
  seller_net_payout_cents int,
  seller_label_url text,
  seller_label_carrier text,
  seller_label_service text,
  seller_tracking_number text,
  buyer_tracking_number text,
  paid_at timestamptz,
  seller_shipped_at timestamptz,
  received_by_exch_at timestamptz,
  verified_at timestamptz,
  shipped_to_buyer_at timestamptz,
  delivered_to_buyer_at timestamptz,
  payout_available_at timestamptz,
  payout_paid_at timestamptz,
  refunded_at timestamptz,
  role text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.created_at,
    t.product_handle,
    t.size_label,
    t.price_cents,
    t.currency,
    t.status,
    case when t.buyer_id = auth.uid() then t.stripe_checkout_session_id else null end,
    t.buyer_shipping_cents,
    t.buyer_processing_fee_cents,
    t.buyer_total_cents,
    case when t.seller_id = auth.uid() then t.seller_inbound_label_cents else null end,
    case when t.seller_id = auth.uid() then t.seller_fee_cents else null end,
    case when t.seller_id = auth.uid() then t.seller_net_payout_cents else null end,
    case when t.seller_id = auth.uid() then t.seller_label_url else null end,
    case when t.seller_id = auth.uid() then t.seller_label_carrier else null end,
    case when t.seller_id = auth.uid() then t.seller_label_service else null end,
    case when t.seller_id = auth.uid() then t.seller_tracking_number else null end,
    case when t.buyer_id = auth.uid() then t.buyer_tracking_number else null end,
    t.paid_at,
    t.seller_shipped_at,
    t.received_by_exch_at,
    t.verified_at,
    t.shipped_to_buyer_at,
    t.delivered_to_buyer_at,
    t.payout_available_at,
    t.payout_paid_at,
    t.refunded_at,
    case when t.buyer_id = auth.uid() then 'buyer' else 'seller' end
  from public.p2p_trades t
  where auth.uid() is not null
    and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
  order by t.created_at desc;
$$;
