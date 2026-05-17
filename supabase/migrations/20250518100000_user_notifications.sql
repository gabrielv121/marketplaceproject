-- In-app notifications for buyers and sellers (paired with email where applicable).

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  href text,
  trade_id uuid references public.p2p_trades (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create index user_notifications_user_unread_idx
  on public.user_notifications (user_id, created_at desc)
  where read_at is null;

comment on table public.user_notifications is
  'Per-user in-app alerts for orders, bids, labels, and payouts. Inserted by Edge Functions (service role).';

alter table public.user_notifications enable row level security;

create policy "user_notifications_select_own"
  on public.user_notifications for select
  using (auth.uid() = user_id);

create policy "user_notifications_update_own"
  on public.user_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Inserts are service-role only (Edge Functions); users cannot create notifications.

alter publication supabase_realtime add table public.user_notifications;
