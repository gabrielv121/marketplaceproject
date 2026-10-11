-- Prefer StockX size asks stored by the KicksDB importer.
-- Products that have not been synced yet keep the size curve.

create table if not exists public.platform_size_asks (
  product_handle text not null references public.catalog_products (handle) on delete cascade,
  size_label text not null,
  price_cents int not null check (price_cents > 0),
  updated_at timestamptz not null default now(),
  primary key (product_handle, size_label)
);

create table if not exists public.platform_size_price_sync (
  product_handle text primary key references public.catalog_products (handle) on delete cascade,
  synced_at timestamptz not null default now(),
  source text not null default 'kicksdb'
);

alter table public.platform_size_asks enable row level security;
alter table public.platform_size_price_sync enable row level security;

create or replace function public.platform_size_price_cents(p_product_handle text, p_size_label text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.platform_size_price_sync s
      where s.product_handle = p_product_handle
    )
    then (
      select a.price_cents
      from public.platform_size_asks a
      where a.product_handle = p_product_handle
        and a.size_label = p_size_label
    )
    else greatest(
      100,
      (
        round(
          public.platform_offer_price_cents(p_product_handle)
          * public.platform_size_multiplier_bps(p_size_label)
          / 1000000.0
        ) * 100
      )::int
    )
  end;
$$;

create or replace function public.list_platform_offer(p_product_handle text)
returns table (
  product_handle text,
  quantity_available int,
  price_cents int,
  currency text,
  source text,
  size_prices jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.product_handle,
    greatest(i.quantity_on_hand - i.quantity_reserved, 0) as quantity_available,
    public.platform_offer_price_cents(i.product_handle) as price_cents,
    'USD'::text as currency,
    i.source,
    case
      when exists (
        select 1 from public.platform_size_price_sync s
        where s.product_handle = i.product_handle
      )
      then coalesce((
        select jsonb_object_agg(a.size_label, a.price_cents)
        from public.platform_size_asks a
        where a.product_handle = i.product_handle
      ), '{}'::jsonb)
      else (
        select jsonb_object_agg(labels.label, public.platform_size_price_cents(i.product_handle, labels.label))
        from (
          select 'US M ' || u as label
          from unnest(array['6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','12.5','13','14','15','15.5']) as u
          union all
          select 'US W ' || u
          from unnest(array['6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','12.5','13','14','15','15.5']) as u
        ) labels
      )
    end as size_prices
  from public.platform_inventory i
  where i.product_handle = p_product_handle;
$$;
