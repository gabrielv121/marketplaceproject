-- Verification + payout lifecycle:
-- - buyer payment is collected by the platform first
-- - seller ships item to EXCH. for verification
-- - payout becomes available only after verification and buyer delivery

alter table public.p2p_trades
  drop constraint if exists p2p_trades_status_check;

alter table public.p2p_trades
  add constraint p2p_trades_status_check
  check (
    status in (
      'reserved',
      'pending_payment',
      'paid',
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
      'cancelled',
      'refunded'
    )
  );

alter table public.p2p_trades
  add column if not exists paid_at timestamptz,
  add column if not exists seller_notified_at timestamptz,
  add column if not exists seller_ship_by timestamptz,
  add column if not exists seller_shipped_at timestamptz,
  add column if not exists received_by_exch_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists shipped_to_buyer_at timestamptz,
  add column if not exists delivered_to_buyer_at timestamptz,
  add column if not exists payout_available_at timestamptz,
  add column if not exists payout_paid_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists seller_tracking_number text,
  add column if not exists buyer_tracking_number text,
  add column if not exists verification_notes text,
  add column if not exists stripe_transfer_id text;

comment on column public.p2p_trades.paid_at is 'Set when Stripe confirms buyer payment.';
comment on column public.p2p_trades.seller_notified_at is 'Set when seller is told to ship to EXCH. for verification.';
comment on column public.p2p_trades.seller_ship_by is 'Deadline for seller to ship item to EXCH.';
comment on column public.p2p_trades.payout_available_at is 'Set after verification and buyer delivery when seller payout can be released.';
comment on column public.p2p_trades.stripe_transfer_id is 'Stripe transfer id used when releasing held funds to seller after verification.';

comment on column public.profiles.stripe_account_id is 'Stripe Connect account id (acct_xxx). Used for seller payouts after verification, not for buyer checkout.';

create index if not exists p2p_trades_status_idx
  on public.p2p_trades (status, created_at desc);

create index if not exists p2p_trades_payout_available_idx
  on public.p2p_trades (payout_available_at)
  where status = 'payout_available';

create or replace function public.list_recent_sales(p_product_handle text, p_limit int default 50)
returns table (
  size_label text,
  price_cents int,
  currency text,
  sold_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select t.size_label, t.price_cents, t.currency, coalesce(t.paid_at, t.created_at) as sold_at
  from public.p2p_trades t
  where t.product_handle = p_product_handle
    and t.status in (
      'paid',
      'seller_notified',
      'seller_shipped_to_exch',
      'received_by_exch',
      'verification_passed',
      'shipped_to_buyer',
      'delivered_to_buyer',
      'payout_available',
      'payout_paid',
      'completed'
    )
  order by coalesce(t.paid_at, t.created_at) desc
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.list_recent_sales(text, int) from public;
grant execute on function public.list_recent_sales(text, int) to anon, authenticated;
