-- Shipping and payout math for the verification flow:
-- - buyer pays outbound shipping during Checkout
-- - seller receives a prepaid inbound label, deducted from seller payout
-- - platform/seller fee and estimated net payout are stored on the trade

alter table public.p2p_trades
  add column if not exists buyer_shipping_cents int not null default 0 check (buyer_shipping_cents >= 0),
  add column if not exists seller_inbound_label_cents int not null default 0 check (seller_inbound_label_cents >= 0),
  add column if not exists seller_fee_bps int not null default 0 check (seller_fee_bps >= 0 and seller_fee_bps <= 10000),
  add column if not exists seller_fee_cents int not null default 0 check (seller_fee_cents >= 0),
  add column if not exists seller_net_payout_cents int not null default 0 check (seller_net_payout_cents >= 0),
  add column if not exists buyer_total_cents int not null default 0 check (buyer_total_cents >= 0),
  add column if not exists stripe_amount_total_cents int check (stripe_amount_total_cents is null or stripe_amount_total_cents >= 0),
  add column if not exists stripe_amount_shipping_cents int check (stripe_amount_shipping_cents is null or stripe_amount_shipping_cents >= 0);

update public.p2p_trades
set
  buyer_total_cents = case when buyer_total_cents = 0 then price_cents + buyer_shipping_cents else buyer_total_cents end,
  seller_net_payout_cents = case
    when seller_net_payout_cents = 0 then greatest(price_cents - seller_fee_cents - seller_inbound_label_cents, 0)
    else seller_net_payout_cents
  end;

comment on column public.p2p_trades.buyer_shipping_cents is 'Shipping charged to buyer for EXCH.-to-buyer delivery after verification.';
comment on column public.p2p_trades.seller_inbound_label_cents is 'Cost of prepaid seller-to-EXCH. label deducted from seller payout.';
comment on column public.p2p_trades.seller_fee_bps is 'Platform/seller fee basis points captured when Checkout is created.';
comment on column public.p2p_trades.seller_fee_cents is 'Platform/seller fee deducted from seller payout.';
comment on column public.p2p_trades.seller_net_payout_cents is 'Estimated seller payout after platform fee and inbound label deduction.';
comment on column public.p2p_trades.buyer_total_cents is 'Item price plus buyer-paid shipping charged through Checkout.';
comment on column public.p2p_trades.stripe_amount_total_cents is 'Final amount total reported by Stripe Checkout.';
comment on column public.p2p_trades.stripe_amount_shipping_cents is 'Final shipping amount reported by Stripe Checkout.';
