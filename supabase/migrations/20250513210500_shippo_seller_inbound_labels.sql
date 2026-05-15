-- Shippo seller-to-EXCH prepaid inbound labels.

alter table public.p2p_trades
  add column if not exists seller_label_provider text,
  add column if not exists seller_label_id text,
  add column if not exists seller_label_url text,
  add column if not exists seller_label_rate_id text,
  add column if not exists seller_label_carrier text,
  add column if not exists seller_label_service text,
  add column if not exists seller_label_created_at timestamptz;

create unique index if not exists p2p_trades_seller_label_id_idx
  on public.p2p_trades (seller_label_provider, seller_label_id)
  where seller_label_provider is not null and seller_label_id is not null;

comment on column public.p2p_trades.seller_label_provider is 'Shipping label provider for seller-to-EXCH inbound label, e.g. shippo.';
comment on column public.p2p_trades.seller_label_id is 'Provider transaction/label id for seller inbound label.';
comment on column public.p2p_trades.seller_label_url is 'Printable seller-to-EXCH prepaid label URL.';
comment on column public.p2p_trades.seller_label_rate_id is 'Provider rate id used to purchase the inbound label.';
comment on column public.p2p_trades.seller_label_carrier is 'Carrier used for seller-to-EXCH inbound label.';
comment on column public.p2p_trades.seller_label_service is 'Carrier service used for seller-to-EXCH inbound label.';
