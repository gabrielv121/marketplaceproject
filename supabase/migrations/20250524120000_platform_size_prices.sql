-- VRNA inventory prices follow the size. Common sizes sit above the catalog floor; uncommon sizes sit lower.
-- Checkout uses the same function, so the size chip and the charged price match.

create or replace function public.platform_size_multiplier_bps(p_size_label text)
returns int
language sql
immutable
as $$
  select case (regexp_match(coalesce(p_size_label, ''), '(\d+\.?\d*)'))[1]
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
  end;
$$;

create or replace function public.platform_size_price_cents(p_product_handle text, p_size_label text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    100,
    (
      round(
        public.platform_offer_price_cents(p_product_handle)
        * public.platform_size_multiplier_bps(p_size_label)
        / 1000000.0
      ) * 100
    )::int
  );
$$;

drop function if exists public.list_platform_offer(text);

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
    (
      select jsonb_object_agg(s.label, public.platform_size_price_cents(i.product_handle, s.label))
      from (
        select 'US M ' || u as label
        from unnest(array['6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','12.5','13','14','15','15.5']) as u
        union all
        select 'US W ' || u
        from unnest(array['6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','12.5','13','14','15','15.5']) as u
      ) s
    ) as size_prices
  from public.platform_inventory i
  where i.product_handle = p_product_handle;
$$;

create or replace function public.take_platform_inventory(
  p_product_handle text,
  p_size_label text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_inventory%rowtype;
  v_price int;
  v_trade_id uuid;
  v_size text := nullif(btrim(p_size_label), '');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  perform public.require_email_verified();

  if v_size is null then
    raise exception 'size_required';
  end if;

  select * into v_row
  from public.platform_inventory
  where product_handle = p_product_handle
  for update;

  if not found then
    raise exception 'platform_inventory_missing';
  end if;

  if v_row.quantity_on_hand - v_row.quantity_reserved < 1 then
    raise exception 'platform_out_of_stock';
  end if;

  v_price := public.platform_size_price_cents(p_product_handle, v_size);
  if v_price is null or v_price <= 0 then
    raise exception 'platform_price_missing';
  end if;

  update public.platform_inventory
  set quantity_reserved = quantity_reserved + 1,
      updated_at = now()
  where id = v_row.id;

  insert into public.p2p_trades (
    listing_id,
    buyer_id,
    seller_id,
    product_handle,
    size_label,
    price_cents,
    currency,
    status,
    fulfillment_source,
    platform_inventory_id,
    inventory_source
  )
  values (
    null,
    auth.uid(),
    null,
    p_product_handle,
    v_size,
    v_price,
    'USD',
    'reserved',
    'platform',
    v_row.id,
    v_row.source
  )
  returning id into v_trade_id;

  return v_trade_id;
end;
$$;

revoke all on function public.platform_size_multiplier_bps(text) from public;
revoke all on function public.platform_size_price_cents(text, text) from public;

revoke all on function public.list_platform_offer(text) from public;
grant execute on function public.list_platform_offer(text) to anon, authenticated;

revoke all on function public.take_platform_inventory(text, text) from public;
grant execute on function public.take_platform_inventory(text, text) to authenticated;
