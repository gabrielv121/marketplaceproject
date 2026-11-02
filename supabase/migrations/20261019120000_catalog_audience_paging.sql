-- Stored audience + photo flag so catalog aisles can filter, sort, and page in the database.

alter table public.catalog_products
  add column if not exists audience text,
  add column if not exists has_photo boolean not null default false;

-- Mirrors catalogAudience() in src/lib/home-feed.ts: title markers beat stored gender, then dept tags, then department_slug.
create or replace function public.catalog_audience_for(
  p_title text,
  p_gender text,
  p_department text,
  p_tags text[]
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  t text := lower(coalesce(p_title, ''));
  g text := lower(coalesce(p_gender, ''));
  d text := lower(coalesce(p_department, ''));
  tags text[] := coalesce((select array_agg(lower(x)) from unnest(coalesce(p_tags, '{}')) as x), '{}');
  title_women boolean;
  title_men boolean;
  title_kids boolean;
  tag_women boolean;
  tag_men boolean;
  tag_kids boolean;
begin
  title_women := t ~ '\m(women''?s|womens|wmns|ladies)\M' or t ~ '\(\s*w\s*\)';
  title_men := t ~ '\m(men''?s|mens)\M';
  title_kids := t ~ '\m(kids|youth|toddler|preschool|grade school|infants?|girls?|boys)\M'
    or t ~ '\mgs\M'
    or t ~ '\(\s*(gs|ps|td)\s*\)';

  if title_women and not title_men then return 'women'; end if;
  if title_kids then return 'kids'; end if;
  if title_men and not title_women then return 'men'; end if;

  if g in ('men', 'women', 'kids') then return g; end if;

  tag_women := 'dept-women' = any(tags);
  tag_men := 'dept-men' = any(tags);
  tag_kids := 'dept-kids' = any(tags);
  if (tag_women::int + tag_men::int + tag_kids::int) > 1 then return 'unisex'; end if;
  if tag_women then return 'women'; end if;
  if tag_men then return 'men'; end if;
  if tag_kids then return 'kids'; end if;
  if d in ('men', 'women', 'kids') then return d; end if;
  return 'unisex';
end;
$$;

-- Mirrors hasRealCatalogProductImage() in src/lib/catalog-image-quality.ts.
create or replace function public.catalog_has_photo(p_featured text, p_gallery text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select exists (
    select 1
    from unnest(array[p_featured] || coalesce(p_gallery, '{}')) as u(url)
    where nullif(trim(url), '') is not null
      and trim(url) !~* '(product-placeholder|placeholder-default)'
  );
$$;

create or replace function public.catalog_products_set_derived()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.audience := public.catalog_audience_for(new.title, new.gender, new.department_slug, new.tags);
  new.has_photo := public.catalog_has_photo(new.featured_image_url, new.image_gallery);
  return new;
end;
$$;

drop trigger if exists catalog_products_derived on public.catalog_products;
create trigger catalog_products_derived
  before insert or update on public.catalog_products
  for each row execute function public.catalog_products_set_derived();

-- Keep updated_at intact so New arrivals order does not reset to the migration time.
alter table public.catalog_products disable trigger catalog_products_touch;
update public.catalog_products
set
  audience = public.catalog_audience_for(title, gender, department_slug, tags),
  has_photo = public.catalog_has_photo(featured_image_url, image_gallery);
alter table public.catalog_products enable trigger catalog_products_touch;

create index if not exists catalog_products_listable_audience_trend
  on public.catalog_products (audience, trend_score desc, title, id)
  where published and has_photo;

create index if not exists catalog_products_listable_updated
  on public.catalog_products (updated_at desc, id)
  where published and has_photo;

create index if not exists catalog_products_tags_gin on public.catalog_products using gin (tags);
create index if not exists catalog_products_activities_gin on public.catalog_products using gin (activities);

-- Brand and type dropdown options for a paged aisle (same base filter as the paged query).
create or replace function public.catalog_facets(p_audiences text[] default null, p_activity text default null)
returns table (kind text, name text, product_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select trim(brand) as brand, nullif(trim(product_type), '') as product_type
    from public.catalog_products
    where published
      and has_photo
      and tags @> array['kicksdb']
      and (p_audiences is null or audience = any(p_audiences))
      and (p_activity is null or activities @> array[p_activity])
  )
  select 'brand', brand, count(*) from base where nullif(brand, '') is not null group by brand
  union all
  select 'type', product_type, count(*) from base where product_type is not null group by product_type;
$$;

revoke all on function public.catalog_facets(text[], text) from public;
grant execute on function public.catalog_facets(text[], text) to anon, authenticated;
