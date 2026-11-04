-- Admin catalog tools: hide a product, override its photo, and pin it to the home page.
-- Overrides live in their own columns so KicksDB re-imports (which upsert the base columns) keep them.

alter table public.catalog_products
  add column if not exists admin_hidden boolean not null default false,
  add column if not exists admin_image_url text,
  add column if not exists featured_at timestamptz;

create index if not exists catalog_products_featured
  on public.catalog_products (featured_at desc)
  where featured_at is not null and published;

create or replace function public.catalog_products_set_derived()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.admin_hidden then
    new.published := false;
  end if;
  if nullif(btrim(coalesce(new.admin_image_url, '')), '') is not null then
    new.featured_image_url := new.admin_image_url;
  end if;
  new.audience := public.catalog_audience_for(new.title, new.gender, new.department_slug, new.tags);
  new.has_photo := public.catalog_has_photo(new.featured_image_url, new.image_gallery);
  return new;
end;
$$;

-- Admin edits must not bump updated_at, which orders New arrivals.
create or replace function public.touch_catalog_product()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_setting('vrna.skip_catalog_touch', true) = 'on' then
    return new;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.admin_search_catalog(p_query text, p_limit int default 40)
returns table (
  handle text,
  title text,
  brand text,
  featured_image_url text,
  image_gallery text[],
  published boolean,
  has_photo boolean,
  admin_hidden boolean,
  admin_image_url text,
  featured_at timestamptz,
  price_min numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_limit int := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  if v_q = '' then
    return query
      select c.handle, c.title, c.brand, c.featured_image_url, c.image_gallery, c.published, c.has_photo,
             c.admin_hidden, c.admin_image_url, c.featured_at, c.price_min::numeric
      from public.catalog_products c
      where c.featured_at is not null or c.admin_hidden or c.admin_image_url is not null
      order by c.featured_at desc nulls last, c.updated_at desc
      limit v_limit;
    return;
  end if;

  return query
    select c.handle, c.title, c.brand, c.featured_image_url, c.image_gallery, c.published, c.has_photo,
           c.admin_hidden, c.admin_image_url, c.featured_at, c.price_min::numeric
    from public.catalog_products c
    where c.handle = lower(v_q)
       or c.title ilike '%' || v_q || '%'
       or c.handle ilike '%' || replace(lower(v_q), ' ', '-') || '%'
    order by (c.handle = lower(v_q)) desc, c.published desc, c.trend_score desc nulls last, c.title
    limit v_limit;
end;
$$;

create or replace function public.admin_update_catalog_product(
  p_handle text,
  p_hidden boolean default null,
  p_image_url text default null,
  p_featured boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_image text := btrim(coalesce(p_image_url, ''));
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;
  if p_image_url is not null and v_image <> '' and v_image !~* '^https://' then
    raise exception 'image_url_must_be_https';
  end if;

  perform set_config('vrna.skip_catalog_touch', 'on', true);

  update public.catalog_products c
  set
    admin_hidden = coalesce(p_hidden, c.admin_hidden),
    published = case when p_hidden is null then c.published else not p_hidden end,
    admin_image_url = case when p_image_url is null then c.admin_image_url else nullif(v_image, '') end,
    featured_at = case
      when p_featured is null then c.featured_at
      when p_featured then coalesce(c.featured_at, now())
      else null
    end
  where c.handle = p_handle;

  if not found then
    raise exception 'product_not_found';
  end if;

  perform set_config('vrna.skip_catalog_touch', 'off', true);
end;
$$;

revoke all on function public.admin_search_catalog(text, int) from public, anon;
grant execute on function public.admin_search_catalog(text, int) to authenticated;
revoke all on function public.admin_update_catalog_product(text, boolean, text, boolean) from public, anon;
grant execute on function public.admin_update_catalog_product(text, boolean, text, boolean) to authenticated;
