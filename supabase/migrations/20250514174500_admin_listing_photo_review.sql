-- Admin listing photo review: expose seller listing intake details on verification trades.

drop function if exists public.admin_list_verification_trades();

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
  seller_label_service text,
  buyer_shipping_name text,
  buyer_shipping_email text,
  buyer_shipping_phone text,
  buyer_shipping_line1 text,
  buyer_shipping_line2 text,
  buyer_shipping_city text,
  buyer_shipping_state text,
  buyer_shipping_postal_code text,
  buyer_shipping_country text,
  buyer_label_url text,
  buyer_label_carrier text,
  buyer_label_service text,
  stripe_transfer_id text,
  stripe_transfer_amount_cents int,
  stripe_transfer_error text,
  listing_condition text,
  listing_photo_urls text[],
  listing_defects text,
  listing_box_included boolean,
  listing_sku text,
  listing_seller_notes text,
  listing_verification_requirements_accepted_at timestamptz
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
    t.seller_label_service,
    t.buyer_shipping_name,
    t.buyer_shipping_email,
    t.buyer_shipping_phone,
    t.buyer_shipping_line1,
    t.buyer_shipping_line2,
    t.buyer_shipping_city,
    t.buyer_shipping_state,
    t.buyer_shipping_postal_code,
    t.buyer_shipping_country,
    t.buyer_label_url,
    t.buyer_label_carrier,
    t.buyer_label_service,
    t.stripe_transfer_id,
    t.stripe_transfer_amount_cents,
    t.stripe_transfer_error,
    l.condition as listing_condition,
    coalesce(l.photo_urls, '{}'::text[]) as listing_photo_urls,
    l.defects as listing_defects,
    l.box_included as listing_box_included,
    l.sku as listing_sku,
    l.seller_notes as listing_seller_notes,
    l.verification_requirements_accepted_at as listing_verification_requirements_accepted_at
  from public.p2p_trades t
  left join public.p2p_listings l on l.id = t.listing_id
  left join auth.users buyer on buyer.id = t.buyer_id
  left join auth.users seller on seller.id = t.seller_id
  order by t.created_at desc;
end;
$$;

revoke all on function public.admin_list_verification_trades() from public;
grant execute on function public.admin_list_verification_trades() to authenticated;
