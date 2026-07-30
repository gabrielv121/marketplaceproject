-- Admin feed of recently created seller listings (asks).

create or replace function public.admin_list_recent_listings(p_limit int default 100)
returns table (
  id uuid,
  created_at timestamptz,
  seller_id uuid,
  seller_email text,
  product_handle text,
  product_title text,
  product_image_url text,
  size_label text,
  price_cents int,
  currency text,
  status text,
  condition text,
  photo_urls text[],
  defects text,
  box_included boolean,
  sku text,
  seller_notes text,
  verification_requirements_accepted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    l.id,
    l.created_at,
    l.seller_id,
    seller.email::text as seller_email,
    l.product_handle,
    c.title as product_title,
    c.featured_image_url as product_image_url,
    l.size_label,
    l.price_cents,
    l.currency,
    l.status,
    l.condition,
    coalesce(l.photo_urls, '{}'::text[]) as photo_urls,
    l.defects,
    l.box_included,
    l.sku,
    l.seller_notes,
    l.verification_requirements_accepted_at
  from public.p2p_listings l
  left join auth.users seller on seller.id = l.seller_id
  left join public.catalog_products c on c.handle = l.product_handle
  order by l.created_at desc
  limit lim;
end;
$$;

revoke all on function public.admin_list_recent_listings(int) from public;
grant execute on function public.admin_list_recent_listings(int) to authenticated;
