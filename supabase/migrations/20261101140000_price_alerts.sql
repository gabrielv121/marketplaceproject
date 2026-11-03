-- Price drop alerts: "tell me when size 10 drops to $200 or less".
-- A new or cheaper ask (peer listing or VRNA size price) fires an in-app notification once, then the alert is done.

create or replace function public.normalize_size_label(p_label text)
returns text
language sql
immutable
as $$
  select case
    when m_legacy is not null then 'US M ' || m_legacy[1]
    when m_spaced is not null then 'US ' || upper(m_spaced[1]) || ' ' || m_spaced[2]
    else v
  end
  from (
    select
      v,
      regexp_match(v, '^US ([0-9.]+)$', 'i') as m_legacy,
      regexp_match(v, '^US ([MW]) ([0-9.]+)$', 'i') as m_spaced
    from (select regexp_replace(btrim(coalesce(p_label, '')), '\s+', ' ', 'g') as v) t
  ) parsed;
$$;

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_handle text not null references public.catalog_products (handle) on delete cascade,
  size_label text not null,
  target_cents int not null check (target_cents > 0),
  status text not null default 'active' check (status in ('active', 'triggered')),
  triggered_at timestamptz,
  triggered_price_cents int
);

create unique index if not exists price_alerts_one_active_per_size
  on public.price_alerts (user_id, product_handle, size_label)
  where status = 'active';

create index if not exists price_alerts_active_lookup
  on public.price_alerts (product_handle, size_label)
  where status = 'active';

create index if not exists price_alerts_user_created
  on public.price_alerts (user_id, created_at desc);

alter table public.price_alerts enable row level security;

drop policy if exists price_alerts_select_own on public.price_alerts;
create policy price_alerts_select_own
  on public.price_alerts for select
  using (auth.uid() = user_id);

drop policy if exists price_alerts_insert_own on public.price_alerts;
create policy price_alerts_insert_own
  on public.price_alerts for insert
  with check (auth.uid() = user_id and status = 'active');

drop policy if exists price_alerts_delete_own on public.price_alerts;
create policy price_alerts_delete_own
  on public.price_alerts for delete
  using (auth.uid() = user_id);

create or replace function public.price_alerts_before_insert()
returns trigger
language plpgsql
as $$
begin
  new.size_label := public.normalize_size_label(new.size_label);
  if (
    select count(*) from public.price_alerts a
    where a.user_id = new.user_id and a.status = 'active'
  ) >= 100 then
    raise exception 'price_alert_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists price_alerts_before_insert on public.price_alerts;
create trigger price_alerts_before_insert
  before insert on public.price_alerts
  for each row execute function public.price_alerts_before_insert();

-- Cheapest buyable price for one size: active peer listings and in-stock VRNA inventory.
create or replace function public.lowest_ask_cents(p_product_handle text, p_size_label text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select min(c)
  from (
    select min(l.price_cents) as c
    from public.p2p_listings l
    where l.product_handle = p_product_handle
      and l.status = 'active'
      and public.normalize_size_label(l.size_label) = public.normalize_size_label(p_size_label)
    union all
    select public.platform_size_price_cents(p_product_handle, public.normalize_size_label(p_size_label))
    where exists (
      select 1 from public.platform_inventory i
      where i.product_handle = p_product_handle
        and i.quantity_on_hand - i.quantity_reserved > 0
    )
  ) asks;
$$;

create or replace function public.fire_price_alerts(p_product_handle text, p_size_label text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_size text := public.normalize_size_label(p_size_label);
  v_price int;
begin
  if not exists (
    select 1 from public.price_alerts a
    where a.product_handle = p_product_handle and a.size_label = v_size and a.status = 'active'
  ) then
    return;
  end if;

  v_price := public.lowest_ask_cents(p_product_handle, v_size);
  if v_price is null then
    return;
  end if;

  with hit as (
    update public.price_alerts a
    set status = 'triggered', triggered_at = now(), triggered_price_cents = v_price
    where a.product_handle = p_product_handle
      and a.size_label = v_size
      and a.status = 'active'
      and a.target_cents >= v_price
    returning a.user_id, a.product_handle, a.size_label, a.target_cents
  )
  insert into public.user_notifications (user_id, kind, title, body, href)
  select
    hit.user_id,
    'price_alert',
    'Price drop: ' || coalesce(cp.title, hit.product_handle),
    'Size ' || hit.size_label || ' is now $' || to_char(v_price / 100.0, 'FM999,999,990.00')
      || ' (your alert was $' || to_char(hit.target_cents / 100.0, 'FM999,999,990.00') || ').',
    '/product/' || hit.product_handle
  from hit
  left join public.catalog_products cp on cp.handle = hit.product_handle;
end;
$$;

revoke all on function public.fire_price_alerts(text, text) from public, anon, authenticated;
revoke all on function public.lowest_ask_cents(text, text) from public, anon, authenticated;

create or replace function public.p2p_listings_fire_price_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' then
    perform public.fire_price_alerts(new.product_handle, new.size_label);
  end if;
  return null;
end;
$$;

drop trigger if exists p2p_listings_fire_price_alerts on public.p2p_listings;
create trigger p2p_listings_fire_price_alerts
  after insert or update of price_cents, status on public.p2p_listings
  for each row execute function public.p2p_listings_fire_price_alerts();

create or replace function public.platform_size_asks_fire_price_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fire_price_alerts(new.product_handle, new.size_label);
  return null;
end;
$$;

drop trigger if exists platform_size_asks_fire_price_alerts on public.platform_size_asks;
create trigger platform_size_asks_fire_price_alerts
  after insert or update of price_cents on public.platform_size_asks
  for each row execute function public.platform_size_asks_fire_price_alerts();
