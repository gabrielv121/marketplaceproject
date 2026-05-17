-- Unpublish KicksDB catalog rows that only have StockX placeholder imagery (no real product photo).

update public.catalog_products cp
set published = false, updated_at = now()
where cp.published = true
  and 'kicksdb' = any (coalesce(cp.tags, '{}'::text[]))
  and not exists (
    select 1
    from unnest(
      array_cat(
        array[cp.featured_image_url],
        coalesce(cp.image_gallery, '{}'::text[])
      )
    ) as img(url)
    where url is not null
      and btrim(url) <> ''
      and url !~* 'product-placeholder|placeholder-default|stockx-assets\.imgix\.net/media/product-placeholder'
  );
