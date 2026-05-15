-- Catalog in Supabase (multi-vendor: optional vendor_id). Rename P2P variant reference away from Shopify.

alter table public.p2p_listings rename column shopify_variant_id to catalog_variant_id;

-- Return type column renamed (shopify_variant_id → catalog_variant_id); CREATE OR REPLACE cannot do that.
drop function if exists public.list_active_listings(text);

create or replace function public.list_active_listings(p_product_handle text)
returns table (
  id uuid,
  created_at timestamptz,
  size_label text,
  catalog_variant_id text,
  price_cents int,
  currency text
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.created_at, l.size_label, l.catalog_variant_id, l.price_cents, l.currency
  from public.p2p_listings l
  where l.product_handle = p_product_handle
    and l.status = 'active'
  order by l.price_cents asc, l.created_at asc;
$$;

revoke all on function public.list_active_listings(text) from public;
grant execute on function public.list_active_listings(text) to anon, authenticated;

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  handle text not null unique,
  title text not null,
  brand text,
  description text default '',
  department_slug text,
  tags text[] not null default '{}',
  product_type text,
  home_rails text[] not null default '{}',
  activities text[] not null default '{}',
  variant_size_preset text
    check (variant_size_preset is null or variant_size_preset in ('shoe', 'apparel', 'accessory')),
  featured_image_url text,
  price_min numeric not null,
  price_max numeric not null,
  currency text not null default 'USD',
  vendor_id uuid references public.profiles (id) on delete set null,
  published boolean not null default true
);

create index catalog_products_department_published on public.catalog_products (department_slug, published);
create index catalog_products_updated on public.catalog_products (updated_at desc);

create or replace function public.touch_catalog_product()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger catalog_products_touch
  before update on public.catalog_products
  for each row execute function public.touch_catalog_product();

alter table public.catalog_products enable row level security;

create policy "catalog_products_read_published"
  on public.catalog_products for select
  using (published = true);

create policy "catalog_products_insert_vendor"
  on public.catalog_products for insert
  with check (auth.uid() is not null and vendor_id = auth.uid());

create policy "catalog_products_update_vendor"
  on public.catalog_products for update
  using (vendor_id is not null and vendor_id = auth.uid());

grant select on public.catalog_products to anon, authenticated;
grant insert, update on public.catalog_products to authenticated;
