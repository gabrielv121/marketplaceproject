-- Buyer processing fee (StockX-style), charged at Checkout on item price.

alter table public.p2p_trades
  add column if not exists buyer_processing_fee_bps int not null default 0 check (buyer_processing_fee_bps >= 0 and buyer_processing_fee_bps <= 10000),
  add column if not exists buyer_processing_fee_cents int not null default 0 check (buyer_processing_fee_cents >= 0);

comment on column public.p2p_trades.buyer_processing_fee_bps is 'Buyer processing fee basis points captured when Checkout is created.';
comment on column public.p2p_trades.buyer_processing_fee_cents is 'Processing fee charged to buyer (percent of item price).';
