-- Let the home page hear new catalog rows as the import API inserts them.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'catalog_products'
     ) then
    alter publication supabase_realtime add table public.catalog_products;
  end if;
end $$;
