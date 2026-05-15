-- Seller listing management. Active listings can be edited; reserved/sold listings cannot be changed.

drop policy if exists "listings_update_own" on public.p2p_listings;

create policy "listings_update_own_active_only"
  on public.p2p_listings for update
  using (auth.uid() = seller_id and status = 'active')
  with check (auth.uid() = seller_id and status = 'active');

create or replace function public.update_active_listing(
  p_listing_id uuid,
  p_price_cents int,
  p_condition text,
  p_photo_urls text[],
  p_defects text default null,
  p_box_included boolean default false,
  p_sku text default null,
  p_seller_notes text default null,
  p_verification_requirements_accepted boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_price_cents is null or p_price_cents <= 0 then
    raise exception 'invalid_price';
  end if;

  if p_condition is null or p_condition not in ('new', 'new_with_defects', 'excellent', 'good', 'fair') then
    raise exception 'invalid_condition';
  end if;

  if coalesce(array_length(p_photo_urls, 1), 0) = 0 then
    raise exception 'photos_required';
  end if;

  if not p_verification_requirements_accepted then
    raise exception 'verification_requirements_required';
  end if;

  update public.p2p_listings l
  set
    price_cents = p_price_cents,
    condition = p_condition,
    photo_urls = coalesce(p_photo_urls, '{}'::text[]),
    defects = nullif(btrim(coalesce(p_defects, '')), ''),
    box_included = coalesce(p_box_included, false),
    sku = nullif(btrim(coalesce(p_sku, '')), ''),
    seller_notes = nullif(btrim(coalesce(p_seller_notes, '')), ''),
    verification_requirements_accepted_at = coalesce(l.verification_requirements_accepted_at, now())
  where l.id = p_listing_id
    and l.seller_id = auth.uid()
    and l.status = 'active'
    and not exists (
      select 1
      from public.p2p_trades t
      where t.listing_id = l.id
        and t.status not in ('cancelled', 'refunded')
    );

  if not found then
    raise exception 'listing_not_editable';
  end if;
end;
$$;

revoke all on function public.update_active_listing(uuid, int, text, text[], text, boolean, text, text, boolean) from public;
grant execute on function public.update_active_listing(uuid, int, text, text[], text, boolean, text, text, boolean) to authenticated;
