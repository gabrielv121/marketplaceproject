-- Admin analytics RPCs + buyer fee on verification trade list.

create or replace function public.admin_analytics_overview(p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := coalesce(p_since, '1970-01-01'::timestamptz);
  paid_statuses text[] := array[
    'paid','seller_notified','seller_shipped_to_exch','received_by_exch',
    'verification_passed','verification_failed','shipped_to_buyer','delivered_to_buyer',
    'payout_available','payout_paid','payout_failed','completed'
  ];
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  return jsonb_build_object(
    'users_total', (select count(*)::int from public.profiles),
    'users_since', (select count(*)::int from public.profiles where created_at >= since),
    'users_unverified', (select count(*)::int from public.profiles where email_verified = false),
    'listings_active', (select count(*)::int from public.p2p_listings where status = 'active'),
    'listings_since', (select count(*)::int from public.p2p_listings where created_at >= since),
    'orders_paid_since', (
      select count(*)::int from public.p2p_trades
      where status = any(paid_statuses) and coalesce(paid_at, created_at) >= since
    ),
    'gmv_cents_since', (
      select coalesce(sum(price_cents), 0)::bigint from public.p2p_trades
      where status = any(paid_statuses) and coalesce(paid_at, created_at) >= since
    ),
    'revenue_cents_since', (
      select coalesce(sum(buyer_processing_fee_cents + seller_fee_cents), 0)::bigint from public.p2p_trades
      where status = any(paid_statuses)
        and status not in ('verification_failed')
        and coalesce(paid_at, created_at) >= since
    ),
    'payouts_released_cents_since', (
      select coalesce(sum(coalesce(stripe_transfer_amount_cents, seller_net_payout_cents)), 0)::bigint
      from public.p2p_trades
      where status = 'payout_paid' and coalesce(payout_paid_at, created_at) >= since
    ),
    'connect_incomplete', (
      select count(distinct s.seller_id)::int
      from (
        select seller_id from public.p2p_listings
        union
        select seller_id from public.p2p_trades
      ) s
      join public.profiles p on p.id = s.seller_id
      where p.stripe_account_id is null
         or coalesce(p.stripe_payouts_enabled, false) = false
    ),
    'search_events_since', (select count(*)::int from public.search_events where created_at >= since),
    'product_views_since', (select count(*)::int from public.product_views where created_at >= since)
  );
end;
$$;

create or replace function public.admin_analytics_user_growth(p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := coalesce(p_since, now() - interval '90 days');
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  return jsonb_build_object(
    'verified_total', (select count(*)::int from public.profiles where email_verified = true),
    'unverified_total', (select count(*)::int from public.profiles where email_verified = false),
    'daily', coalesce((
      select jsonb_agg(row_to_json(d) order by d.day)
      from (
        select date_trunc('day', created_at)::date as day, count(*)::int as signups
        from public.profiles
        where created_at >= since
        group by 1
      ) d
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(row_to_json(r) order by r.created_at desc)
      from (
        select
          p.id,
          p.created_at,
          p.display_name,
          p.email_verified,
          u.email::text as email
        from public.profiles p
        left join auth.users u on u.id = p.id
        order by p.created_at desc
        limit 40
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_analytics_listings(p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := coalesce(p_since, now() - interval '90 days');
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  return jsonb_build_object(
    'by_status', coalesce((
      select jsonb_object_agg(status, cnt)
      from (
        select status, count(*)::int as cnt from public.p2p_listings group by status
      ) s
    ), '{}'::jsonb),
    'daily', coalesce((
      select jsonb_agg(row_to_json(d) order by d.day)
      from (
        select date_trunc('day', created_at)::date as day, count(*)::int as created
        from public.p2p_listings
        where created_at >= since
        group by 1
      ) d
    ), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(row_to_json(t) order by t.listings desc)
      from (
        select
          l.product_handle,
          max(c.title) as product_title,
          max(c.brand) as brand,
          count(*)::int as listings
        from public.p2p_listings l
        left join public.catalog_products c on c.handle = l.product_handle
        where l.created_at >= since
        group by l.product_handle
        order by count(*) desc
        limit 15
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_analytics_orders(p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := coalesce(p_since, now() - interval '90 days');
  paid_statuses text[] := array[
    'paid','seller_notified','seller_shipped_to_exch','received_by_exch',
    'verification_passed','verification_failed','shipped_to_buyer','delivered_to_buyer',
    'payout_available','payout_paid','payout_failed','completed'
  ];
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  return jsonb_build_object(
    'by_status', coalesce((
      select jsonb_object_agg(status, cnt)
      from (
        select status, count(*)::int as cnt from public.p2p_trades group by status
      ) s
    ), '{}'::jsonb),
    'daily', coalesce((
      select jsonb_agg(row_to_json(d) order by d.day)
      from (
        select
          date_trunc('day', coalesce(paid_at, created_at))::date as day,
          count(*)::int as orders,
          coalesce(sum(price_cents), 0)::bigint as gmv_cents
        from public.p2p_trades
        where status = any(paid_statuses)
          and coalesce(paid_at, created_at) >= since
        group by 1
      ) d
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_analytics_revenue(p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := coalesce(p_since, now() - interval '90 days');
  paid_statuses text[] := array[
    'paid','seller_notified','seller_shipped_to_exch','received_by_exch',
    'verification_passed','shipped_to_buyer','delivered_to_buyer',
    'payout_available','payout_paid','payout_failed','completed'
  ];
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  return jsonb_build_object(
    'buyer_fee_cents', (
      select coalesce(sum(buyer_processing_fee_cents), 0)::bigint from public.p2p_trades
      where status = any(paid_statuses) and coalesce(paid_at, created_at) >= since
    ),
    'seller_fee_cents', (
      select coalesce(sum(seller_fee_cents), 0)::bigint from public.p2p_trades
      where status = any(paid_statuses) and coalesce(paid_at, created_at) >= since
    ),
    'total_revenue_cents', (
      select coalesce(sum(buyer_processing_fee_cents + seller_fee_cents), 0)::bigint from public.p2p_trades
      where status = any(paid_statuses) and coalesce(paid_at, created_at) >= since
    ),
    'payouts_released_cents', (
      select coalesce(sum(coalesce(stripe_transfer_amount_cents, seller_net_payout_cents)), 0)::bigint
      from public.p2p_trades
      where status = 'payout_paid' and coalesce(payout_paid_at, created_at) >= since
    ),
    'daily', coalesce((
      select jsonb_agg(row_to_json(d) order by d.day)
      from (
        select
          date_trunc('day', coalesce(paid_at, created_at))::date as day,
          coalesce(sum(buyer_processing_fee_cents), 0)::bigint as buyer_fee_cents,
          coalesce(sum(seller_fee_cents), 0)::bigint as seller_fee_cents,
          coalesce(sum(buyer_processing_fee_cents + seller_fee_cents), 0)::bigint as total_cents
        from public.p2p_trades
        where status = any(paid_statuses)
          and coalesce(paid_at, created_at) >= since
        group by 1
      ) d
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_analytics_sellers(p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := coalesce(p_since, now() - interval '90 days');
  paid_statuses text[] := array[
    'paid','seller_notified','seller_shipped_to_exch','received_by_exch',
    'verification_passed','shipped_to_buyer','delivered_to_buyer',
    'payout_available','payout_paid','payout_failed','completed'
  ];
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(s) order by s.gmv_cents desc, s.listings desc)
    from (
      select
        p.id as seller_id,
        u.email::text as seller_email,
        p.display_name,
        p.stripe_account_id,
        p.stripe_charges_enabled,
        p.stripe_payouts_enabled,
        p.stripe_details_submitted,
        (select count(*)::int from public.p2p_listings l where l.seller_id = p.id and l.created_at >= since) as listings,
        (select count(*)::int from public.p2p_trades t
          where t.seller_id = p.id and t.status = any(paid_statuses) and coalesce(t.paid_at, t.created_at) >= since) as sold,
        (select coalesce(sum(t.price_cents), 0)::bigint from public.p2p_trades t
          where t.seller_id = p.id and t.status = any(paid_statuses) and coalesce(t.paid_at, t.created_at) >= since) as gmv_cents,
        (select coalesce(sum(t.seller_fee_cents), 0)::bigint from public.p2p_trades t
          where t.seller_id = p.id and t.status = any(paid_statuses) and coalesce(t.paid_at, t.created_at) >= since) as seller_fee_cents
      from public.profiles p
      left join auth.users u on u.id = p.id
      where exists (
        select 1 from public.p2p_listings l where l.seller_id = p.id
      ) or exists (
        select 1 from public.p2p_trades t where t.seller_id = p.id
      )
      order by 10 desc, 8 desc
      limit 100
    ) s
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_analytics_search(p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := coalesce(p_since, now() - interval '90 days');
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  return jsonb_build_object(
    'total_events', (select count(*)::int from public.search_events where created_at >= since),
    'top_queries', coalesce((
      select jsonb_agg(row_to_json(t) order by t.searches desc)
      from (
        select lower(trim(query)) as query, count(*)::int as searches,
          avg(result_count)::numeric(10,1) as avg_results,
          count(*) filter (where clicked_handle is not null)::int as clicks
        from public.search_events
        where created_at >= since and length(trim(query)) > 0
        group by 1
        order by count(*) desc
        limit 25
      ) t
    ), '[]'::jsonb),
    'zero_result_queries', coalesce((
      select jsonb_agg(row_to_json(z) order by z.searches desc)
      from (
        select lower(trim(query)) as query, count(*)::int as searches
        from public.search_events
        where created_at >= since and result_count = 0 and length(trim(query)) > 0
        group by 1
        order by count(*) desc
        limit 25
      ) z
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(row_to_json(r) order by r.created_at desc)
      from (
        select id, created_at, query, result_count, clicked_handle, user_id
        from public.search_events
        where created_at >= since
        order by created_at desc
        limit 40
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_list_auth_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  return jsonb_build_object(
    'unverified', coalesce((
      select jsonb_agg(row_to_json(u) order by u.created_at desc)
      from (
        select
          p.id,
          p.created_at,
          p.display_name,
          p.email_verified,
          p.email_verify_token_expires_at,
          au.email::text as email
        from public.profiles p
        left join auth.users au on au.id = p.id
        where p.email_verified = false
        order by p.created_at desc
        limit 100
      ) u
    ), '[]'::jsonb),
    'connect_incomplete', coalesce((
      select jsonb_agg(row_to_json(c) order by c.listings desc, c.sales desc)
      from (
        select
          p.id as seller_id,
          au.email::text as seller_email,
          p.display_name,
          p.stripe_account_id,
          p.stripe_charges_enabled,
          p.stripe_payouts_enabled,
          p.stripe_details_submitted,
          (select count(*)::int from public.p2p_listings l where l.seller_id = p.id) as listings,
          (select count(*)::int from public.p2p_trades t where t.seller_id = p.id) as sales
        from public.profiles p
        left join auth.users au on au.id = p.id
        where (
          exists (select 1 from public.p2p_listings l where l.seller_id = p.id)
          or exists (select 1 from public.p2p_trades t where t.seller_id = p.id)
        )
        and (
          p.stripe_account_id is null
          or coalesce(p.stripe_payouts_enabled, false) = false
        )
        order by 8 desc, 9 desc
        limit 100
      ) c
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_analytics_activity(p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(a) order by a.at desc)
    from (
      select * from (
        select
          l.created_at as at,
          'listing_created'::text as kind,
          l.product_handle as subject,
          ('Ask ' || l.size_label || ' · ' || l.status)::text as detail,
          l.seller_id as actor_id
        from public.p2p_listings l
        union all
        select
          b.created_at,
          'bid_placed',
          b.product_handle,
          ('Bid ' || b.size_label || ' · ' || (b.max_price_cents::numeric / 100)::text),
          b.buyer_id
        from public.p2p_bids b
        union all
        select
          coalesce(t.paid_at, t.created_at),
          'trade_' || t.status,
          t.product_handle,
          (t.size_label || ' · $' || (t.price_cents::numeric / 100)::text),
          t.buyer_id
        from public.p2p_trades t
        where t.status not in ('reserved')
        union all
        select
          f.created_at,
          'favorite',
          f.product_handle,
          'Saved product',
          f.user_id
        from public.product_favorites f
        union all
        select
          n.created_at,
          'notification_' || n.kind,
          coalesce(n.title, n.kind),
          left(coalesce(n.body, ''), 120),
          n.user_id
        from public.user_notifications n
      ) x
      order by at desc
      limit lim
    ) a
  ), '[]'::jsonb);
end;
$$;

-- Extend verification trades with buyer processing fee fields.
drop function if exists public.admin_list_verification_trades();

create or replace function public.admin_list_verification_trades()
returns table (
  id uuid,
  created_at timestamptz,
  buyer_id uuid,
  seller_id uuid,
  buyer_email text,
  seller_email text,
  product_handle text,
  size_label text,
  price_cents int,
  currency text,
  status text,
  paid_at timestamptz,
  seller_ship_by timestamptz,
  seller_shipped_at timestamptz,
  received_by_exch_at timestamptz,
  verified_at timestamptz,
  shipped_to_buyer_at timestamptz,
  delivered_to_buyer_at timestamptz,
  payout_available_at timestamptz,
  payout_paid_at timestamptz,
  refunded_at timestamptz,
  seller_tracking_number text,
  buyer_tracking_number text,
  verification_notes text,
  buyer_shipping_cents int,
  buyer_processing_fee_cents int,
  seller_inbound_label_cents int,
  seller_fee_cents int,
  seller_net_payout_cents int,
  buyer_total_cents int,
  seller_label_url text,
  seller_label_carrier text,
  seller_label_service text,
  buyer_shipping_name text,
  buyer_shipping_email text,
  buyer_shipping_phone text,
  buyer_shipping_line1 text,
  buyer_shipping_line2 text,
  buyer_shipping_city text,
  buyer_shipping_state text,
  buyer_shipping_postal_code text,
  buyer_shipping_country text,
  buyer_label_url text,
  buyer_label_carrier text,
  buyer_label_service text,
  stripe_transfer_id text,
  stripe_transfer_amount_cents int,
  stripe_transfer_error text,
  listing_condition text,
  listing_photo_urls text[],
  listing_defects text,
  listing_box_included boolean,
  listing_sku text,
  listing_seller_notes text,
  listing_verification_requirements_accepted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    t.id,
    t.created_at,
    t.buyer_id,
    t.seller_id,
    buyer.email::text as buyer_email,
    seller.email::text as seller_email,
    t.product_handle,
    t.size_label,
    t.price_cents,
    t.currency,
    t.status,
    t.paid_at,
    t.seller_ship_by,
    t.seller_shipped_at,
    t.received_by_exch_at,
    t.verified_at,
    t.shipped_to_buyer_at,
    t.delivered_to_buyer_at,
    t.payout_available_at,
    t.payout_paid_at,
    t.refunded_at,
    t.seller_tracking_number,
    t.buyer_tracking_number,
    t.verification_notes,
    t.buyer_shipping_cents,
    t.buyer_processing_fee_cents,
    t.seller_inbound_label_cents,
    t.seller_fee_cents,
    t.seller_net_payout_cents,
    t.buyer_total_cents,
    t.seller_label_url,
    t.seller_label_carrier,
    t.seller_label_service,
    t.buyer_shipping_name,
    t.buyer_shipping_email,
    t.buyer_shipping_phone,
    t.buyer_shipping_line1,
    t.buyer_shipping_line2,
    t.buyer_shipping_city,
    t.buyer_shipping_state,
    t.buyer_shipping_postal_code,
    t.buyer_shipping_country,
    t.buyer_label_url,
    t.buyer_label_carrier,
    t.buyer_label_service,
    t.stripe_transfer_id,
    t.stripe_transfer_amount_cents,
    t.stripe_transfer_error,
    l.condition as listing_condition,
    coalesce(l.photo_urls, '{}'::text[]) as listing_photo_urls,
    l.defects as listing_defects,
    l.box_included as listing_box_included,
    l.sku as listing_sku,
    l.seller_notes as listing_seller_notes,
    l.verification_requirements_accepted_at as listing_verification_requirements_accepted_at
  from public.p2p_trades t
  left join public.p2p_listings l on l.id = t.listing_id
  left join auth.users buyer on buyer.id = t.buyer_id
  left join auth.users seller on seller.id = t.seller_id
  order by t.created_at desc;
end;
$$;

revoke all on function public.admin_analytics_overview(timestamptz) from public;
grant execute on function public.admin_analytics_overview(timestamptz) to authenticated;

revoke all on function public.admin_analytics_user_growth(timestamptz) from public;
grant execute on function public.admin_analytics_user_growth(timestamptz) to authenticated;

revoke all on function public.admin_analytics_listings(timestamptz) from public;
grant execute on function public.admin_analytics_listings(timestamptz) to authenticated;

revoke all on function public.admin_analytics_orders(timestamptz) from public;
grant execute on function public.admin_analytics_orders(timestamptz) to authenticated;

revoke all on function public.admin_analytics_revenue(timestamptz) from public;
grant execute on function public.admin_analytics_revenue(timestamptz) to authenticated;

revoke all on function public.admin_analytics_sellers(timestamptz) from public;
grant execute on function public.admin_analytics_sellers(timestamptz) to authenticated;

revoke all on function public.admin_analytics_search(timestamptz) from public;
grant execute on function public.admin_analytics_search(timestamptz) to authenticated;

revoke all on function public.admin_list_auth_queue() from public;
grant execute on function public.admin_list_auth_queue() to authenticated;

revoke all on function public.admin_analytics_activity(int) from public;
grant execute on function public.admin_analytics_activity(int) to authenticated;

revoke all on function public.admin_list_verification_trades() from public;
grant execute on function public.admin_list_verification_trades() to authenticated;
