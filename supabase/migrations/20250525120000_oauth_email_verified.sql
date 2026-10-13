-- Google and Apple accounts arrive with a provider-verified email.
-- Mark them verified so buy, bid, and list are not blocked behind a second email step.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', '');
  v_oauth boolean := v_provider in ('google', 'apple');
begin
  insert into public.profiles (id, display_name, email_verified)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(new.raw_user_meta_data->>'display_name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    v_oauth
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
