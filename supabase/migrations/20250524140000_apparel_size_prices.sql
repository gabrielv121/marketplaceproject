-- Apparel, jackets, and accessories use the same VRNA size asks as shoes.
-- Letter sizes and one-size get their own price. A stored StockX ask still wins.

create or replace function public.platform_size_multiplier_bps(p_size_label text)
returns int
language sql
immutable
as $$
  select case upper(btrim(coalesce(p_size_label, '')))
    when 'XS' then 9000
    when 'S' then 9800
    when 'M' then 10600
    when 'L' then 11400
    when 'XL' then 12200
    when 'XXL' then 13000
    when 'XXXL' then 13800
    when 'S/M' then 10200
    when 'M/L' then 11600
    when 'L/XL' then 12800
    when 'ONE SIZE' then 10000
    else case (regexp_match(coalesce(p_size_label, ''), '(\d+\.?\d*)'))[1]
      when '6' then 9300
      when '6.5' then 9560
      when '7' then 10080
      when '7.5' then 10600
      when '8' then 11120
      when '8.5' then 11640
      when '9' then 12160
      when '9.5' then 12680
      when '10' then 13200
      when '10.5' then 12940
      when '11' then 12420
      when '11.5' then 11900
      when '12' then 11380
      when '12.5' then 10860
      when '13' then 10340
      when '14' then 9820
      when '15' then 9040
      when '15.5' then 8780
      else 10000
    end
  end;
$$;

create or replace function public.platform_size_price_cents(p_product_handle text, p_size_label text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.platform_size_asks a
      where a.product_handle = p_product_handle
        and a.size_label = p_size_label
    )
    then (
      select a.price_cents
      from public.platform_size_asks a
      where a.product_handle = p_product_handle
        and a.size_label = p_size_label
    )
    when exists (
      select 1
      from public.platform_size_price_sync s
      where s.product_handle = p_product_handle
    )
    and p_size_label ~ '^US [MW] '
    then null
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
    coalesce((
      select jsonb_object_agg(priced.label, priced.price_cents)
      from (
        select labels.label, public.platform_size_price_cents(i.product_handle, labels.label) as price_cents
        from (
          select 'US M ' || u as label
          from unnest(array['6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','12.5','13','14','15','15.5']) as u
          union all
          select 'US W ' || u
          from unnest(array['6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','12.5','13','14','15','15.5']) as u
          union all
          select u
          from unnest(array['XS','S','M','L','XL','XXL','XXXL','S/M','M/L','L/XL','One size']) as u
        ) labels
      ) priced
      where priced.price_cents is not null
    ), '{}'::jsonb) as size_prices
  from public.platform_inventory i
  where i.product_handle = p_product_handle;
$$;
