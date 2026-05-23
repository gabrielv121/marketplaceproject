-- Early-access waitlist (TikTok / marketing signups).

create table public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  name text,
  source text not null default 'web',
  constraint waitlist_signups_email_unique unique (email)
);

create index waitlist_signups_created_idx on public.waitlist_signups (created_at desc);

comment on table public.waitlist_signups is 'Marketing waitlist emails before public launch.';

alter table public.waitlist_signups enable row level security;

create or replace function public.join_waitlist(
  p_email text,
  p_name text default null,
  p_source text default 'web'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_source text := nullif(trim(coalesce(p_source, '')), '');
  v_id uuid;
  v_existing uuid;
begin
  if v_email = '' then
    raise exception 'email_required';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;

  select id into v_existing from public.waitlist_signups where email = v_email;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'already_joined', true, 'id', v_existing);
  end if;

  insert into public.waitlist_signups (email, name, source)
  values (v_email, v_name, coalesce(v_source, 'web'))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'already_joined', false, 'id', v_id);
exception
  when unique_violation then
    select id into v_existing from public.waitlist_signups where email = v_email;
    return jsonb_build_object('ok', true, 'already_joined', true, 'id', v_existing);
end;
$$;

create or replace function public.admin_list_waitlist(p_limit int default 500)
returns table (
  id uuid,
  created_at timestamptz,
  email text,
  name text,
  source text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select w.id, w.created_at, w.email, w.name, w.source
  from public.waitlist_signups w
  order by w.created_at desc
  limit greatest(1, least(coalesce(p_limit, 500), 2000));
end;
$$;

create or replace function public.admin_waitlist_count()
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'forbidden';
  end if;
  return (select count(*)::bigint from public.waitlist_signups);
end;
$$;

revoke all on function public.join_waitlist(text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text) to anon, authenticated;

revoke all on function public.admin_list_waitlist(int) from public;
grant execute on function public.admin_list_waitlist(int) to authenticated;

revoke all on function public.admin_waitlist_count() from public;
grant execute on function public.admin_waitlist_count() to authenticated;
