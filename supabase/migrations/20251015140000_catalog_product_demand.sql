-- Public demand scores for home rails. Counts only — no user ids.

create or replace function public.catalog_product_demand(
  p_since timestamptz default (now() - interval '14 days')
)
returns table (product_handle text, score int)
language sql
stable
security definer
set search_path = public
as $$
  select product_handle, sum(points)::int as score
  from (
    select v.product_handle, least(count(*)::int, 40) as points
    from public.product_views v
    where v.created_at >= p_since
      and v.product_handle <> ''
    group by v.product_handle
    union all
    select f.product_handle, least(count(*)::int, 20) * 3
    from public.product_favorites f
    where f.created_at >= p_since
      and f.product_handle <> ''
    group by f.product_handle
    union all
    select b.product_handle, least(count(*)::int, 10) * 5
    from public.p2p_bids b
    where b.status = 'open'
      and b.product_handle <> ''
    group by b.product_handle
  ) s
  group by product_handle
  having sum(points) > 0
  order by score desc
  limit 300;
$$;

revoke all on function public.catalog_product_demand(timestamptz) from public;
grant execute on function public.catalog_product_demand(timestamptz) to anon, authenticated;
