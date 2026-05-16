-- Track bid-match notification emails (buyer checkout + seller heads-up).

alter table public.p2p_trades
  add column if not exists bid_match_notified_at timestamptz;

comment on column public.p2p_trades.bid_match_notified_at is
  'Set when bid-match checkout emails were sent to buyer and seller.';
