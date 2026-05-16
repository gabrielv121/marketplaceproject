-- Remove UGG SKUs with wrong/missing Kicks imagery (see blocked-catalog-handles).

delete from public.catalog_products
where handle in (
  'ugg-tasman-chestnut',
  'ugg-tazz-gazette',
  'ugg-classic-mini-ii-black',
  'ugg-neumel-chocolate'
);
