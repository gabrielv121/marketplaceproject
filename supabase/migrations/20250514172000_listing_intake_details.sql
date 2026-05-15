-- Listing intake details: condition, photos, defects, box/SKU, seller notes, and verification acceptance.

alter table public.p2p_listings
  add column if not exists condition text,
  add column if not exists photo_urls text[] not null default '{}',
  add column if not exists defects text,
  add column if not exists box_included boolean not null default false,
  add column if not exists sku text,
  add column if not exists seller_notes text,
  add column if not exists verification_requirements_accepted_at timestamptz;

alter table public.p2p_listings
  drop constraint if exists p2p_listings_condition_check;

alter table public.p2p_listings
  add constraint p2p_listings_condition_check
  check (
    condition is null
    or condition in ('new', 'new_with_defects', 'excellent', 'good', 'fair')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-photos',
  'listing-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "listing_photos_public_read" on storage.objects;
create policy "listing_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'listing-photos');

drop policy if exists "listing_photos_insert_own_folder" on storage.objects;
create policy "listing_photos_insert_own_folder"
  on storage.objects for insert
  with check (
    bucket_id = 'listing-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "listing_photos_update_own_folder" on storage.objects;
create policy "listing_photos_update_own_folder"
  on storage.objects for update
  using (
    bucket_id = 'listing-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'listing-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "listing_photos_delete_own_folder" on storage.objects;
create policy "listing_photos_delete_own_folder"
  on storage.objects for delete
  using (
    bucket_id = 'listing-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
