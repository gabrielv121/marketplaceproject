-- Lowest-ask history per product size for the product page chart.
-- One row per day the lowest ask changed; null means the size had no ask from that day.

create table if not exists public.price_history (
  product_handle text not null references public.catalog_products (handle) on delete cascade,
  size_label text not null,
  recorded_on date not null default current_date,
  lowest_ask_cents int,
  primary key (product_handle, size_label, recorded_on)
);

alter table public.price_history enable row level security;

drop policy if exists price_history_select_all on public.price_history;
create policy price_history_select_all
  on public.price_history for select
  using (true);

grant select on public.price_history to anon, authenticated;

create or replace function public.record_price_point(p_product_handle text, p_size_label text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_size text := public.normalize_size_label(p_size_label);
  v_price int;
  v_prev int;
  v_has_prev boolean;
begin
  v_price := public.lowest_ask_cents(p_product_handle, v_size);

  select h.lowest_ask_cents, true into v_prev, v_has_prev
  from public.price_history h
  where h.product_handle = p_product_handle
    and h.size_label = v_size
    and h.recorded_on < current_date
  order by h.recorded_on desc
  limit 1;

  if coalesce(v_has_prev, false) and v_prev is not distinct from v_price then
    delete from public.price_history
    where product_handle = p_product_handle and size_label = v_size and recorded_on = current_date;
    return;
  end if;

  if not coalesce(v_has_prev, false) and v_price is null then
    return;
  end if;

  insert into public.price_history (product_handle, size_label, recorded_on, lowest_ask_cents)
  values (p_product_handle, v_size, current_date, v_price)
  on conflict (product_handle, size_label, recorded_on)
  do update set lowest_ask_cents = excluded.lowest_ask_cents;
end;
$$;

revoke all on function public.record_price_point(text, text) from public, anon, authenticated;

create or replace function public.p2p_listings_record_price_point()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.record_price_point(new.product_handle, new.size_label);
  if tg_op = 'UPDATE' and old.size_label is distinct from new.size_label then
    perform public.record_price_point(old.product_handle, old.size_label);
  end if;
  return null;
end;
$$;

drop trigger if exists p2p_listings_record_price_point on public.p2p_listings;
create trigger p2p_listings_record_price_point
  after insert or update of price_cents, status, size_label on public.p2p_listings
  for each row execute function public.p2p_listings_record_price_point();

create or replace function public.platform_size_asks_record_price_point()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.record_price_point(new.product_handle, new.size_label);
  return null;
end;
$$;

drop trigger if exists platform_size_asks_record_price_point on public.platform_size_asks;
create trigger platform_size_asks_record_price_point
  after insert or update of price_cents on public.platform_size_asks
  for each row execute function public.platform_size_asks_record_price_point();

-- Starting point: today's lowest ask for every size that has one.
insert into public.price_history (product_handle, size_label, recorded_on, lowest_ask_cents)
select s.product_handle, s.size_label, current_date, public.lowest_ask_cents(s.product_handle, s.size_label)
from (
  select distinct product_handle, public.normalize_size_label(size_label) as size_label
  from (
    select product_handle, size_label from public.platform_size_asks
    union all
    select product_handle, size_label from public.p2p_listings where status = 'active'
  ) src
) s
where public.lowest_ask_cents(s.product_handle, s.size_label) is not null
on conflict do nothing;
