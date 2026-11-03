-- Browser errors reported by the app, readable in the admin dashboard.

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  kind text not null check (kind in ('error', 'unhandledrejection', 'react')),
  message text not null check (char_length(message) <= 1000),
  stack text check (char_length(stack) <= 4000),
  path text check (char_length(path) <= 500),
  user_agent text check (char_length(user_agent) <= 400),
  release text check (char_length(release) <= 80)
);

create index if not exists client_errors_created_at_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert
  on public.client_errors for insert
  to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists client_errors_admin_select on public.client_errors;
create policy client_errors_admin_select
  on public.client_errors for select
  using (public.current_user_is_admin());

drop policy if exists client_errors_admin_delete on public.client_errors;
create policy client_errors_admin_delete
  on public.client_errors for delete
  using (public.current_user_is_admin());

-- Drops floods (over 120 reports a minute site-wide) and prunes rows older than 30 days now and then.
create or replace function public.client_errors_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*) from public.client_errors
    where created_at > now() - interval '1 minute'
  ) >= 120 then
    return null;
  end if;
  if random() < 0.02 then
    delete from public.client_errors where created_at < now() - interval '30 days';
  end if;
  return new;
end;
$$;

drop trigger if exists client_errors_before_insert on public.client_errors;
create trigger client_errors_before_insert
  before insert on public.client_errors
  for each row execute function public.client_errors_before_insert();
