-- Re-publish template accessories (Kicks import unpublishes non-kicksdb rows).
-- Reclassify "Cap and Gown" Jordan colorways mis-tagged as accessory.

update public.catalog_products
set published = true, updated_at = now()
where published = false
  and (
    department_slug = 'accessories'
    or 'dept-accessories' = any (tags)
  );

update public.catalog_products
set
  product_type = 'sneaker',
  variant_size_preset = 'shoe',
  updated_at = now()
where product_type = 'accessory'
  and (
    'sneakers' = any (tags)
    or title ilike '%cap and gown%'
    or handle ilike '%cap-and-gown%'
  );
