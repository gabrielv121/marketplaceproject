-- Stripe Connect + Checkout (Edge Functions). Sellers must complete Connect; store acct id on profiles.

alter table public.profiles
  add column if not exists stripe_account_id text;

comment on column public.profiles.stripe_account_id is 'Stripe Connect account id (acct_xxx). Used for seller payouts after verification.';

alter table public.p2p_trades
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text;

create index if not exists p2p_trades_stripe_session_idx
  on public.p2p_trades (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
