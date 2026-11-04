-- Tracks which triggered price alerts were emailed (send-price-alert-emails edge function).

alter table public.price_alerts add column if not exists emailed_at timestamptz;

create index if not exists price_alerts_email_pending
  on public.price_alerts (triggered_at)
  where status = 'triggered' and emailed_at is null;
