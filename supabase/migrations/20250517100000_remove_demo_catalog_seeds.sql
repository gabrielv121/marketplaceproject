-- Remove template/demo catalog rows from live DB (Unsplash seeds: trending, designer, puffer, UGG).
-- Keep only KicksDB-imported products (tagged `kicksdb`).

delete from public.catalog_products
where not ('kicksdb' = any (coalesce(tags, '{}'::text[])));

comment on table public.catalog_products is
  'Marketplace catalog; live inventory is KicksDB imports (tags include kicksdb).';
