-- Re-publish designer / outerwear / UGG template rows after KicksDB import
-- (import used to unpublish anything without kicksdb; import script is fixed going forward).

update public.catalog_products
set published = true, updated_at = now()
where published = false
  and (
    'designer' = any (tags)
    or 'avant-garde' = any (tags)
    or 'puffer' = any (tags)
    or 'ugg' = any (tags)
  );
