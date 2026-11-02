-- Facets for the paged search page: same whole-word term match as fetchCatalogPage in src/lib/catalog-supabase.ts.

drop function if exists public.catalog_facets(text[], text);

create or replace function public.catalog_facets(
  p_audiences text[] default null,
  p_activity text default null,
  p_terms text[] default null
)
returns table (kind text, name text, product_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with terms as (
    select distinct regexp_replace(lower(t), '[^a-z0-9]', '', 'g') as term
    from unnest(coalesce(p_terms, '{}')) as t
  ),
  clean_terms as (
    select term, '[[:<:]]' || term || '[[:>:]]' as re from terms where term <> ''
  ),
  base as (
    select trim(c.brand) as brand, nullif(trim(c.product_type), '') as product_type
    from public.catalog_products c
    where c.published
      and c.has_photo
      and c.tags @> array['kicksdb']
      and (p_audiences is null or c.audience = any(p_audiences))
      and (p_activity is null or c.activities @> array[p_activity])
      and not exists (
        select 1
        from clean_terms ct
        where not (
          c.title ~* ct.re
          or coalesce(c.brand, '') ~* ct.re
          or c.handle ~* ct.re
          or coalesce(c.product_type, '') ~* ct.re
          or coalesce(c.category, '') ~* ct.re
          or c.tags @> array[ct.term]
          or c.activities @> array[ct.term]
          or c.audience = ct.term
        )
      )
  )
  select 'brand', brand, count(*) from base where nullif(brand, '') is not null group by brand
  union all
  select 'type', product_type, count(*) from base where product_type is not null group by product_type;
$$;

revoke all on function public.catalog_facets(text[], text, text[]) from public;
grant execute on function public.catalog_facets(text[], text, text[]) to anon, authenticated;
