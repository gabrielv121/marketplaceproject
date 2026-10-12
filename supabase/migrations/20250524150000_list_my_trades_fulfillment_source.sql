-- Buyer order lists need to know when a trade is VRNA inventory so the
-- account timeline can skip seller shipment and verification.

drop function if exists public.list_my_trades();

create function public.list_my_trades()
returns table (
  id uuid,
  created_at timestamptz,
  product_handle text,
  size_label text,
  price_cents int,
  currency text,
  status text,
  fulfillment_source text,
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
    t.fulfillment_source,
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

revoke all on function public.list_my_trades() from public;
grant execute on function public.list_my_trades() to authenticated;
