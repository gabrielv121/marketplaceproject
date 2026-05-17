-- Delete in-app notifications older than 7 days (weekly pg_cron when available).

create or replace function public.cleanup_old_user_notifications(
  p_older_than interval default interval '7 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.user_notifications
  where created_at < now() - p_older_than;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.cleanup_old_user_notifications(interval) is
  'Removes user_notifications older than the retention window. pg_cron weekly or cleanup-pending-trades with purge_notifications.';

revoke all on function public.cleanup_old_user_notifications(interval) from public;

do $schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'cleanup-old-user-notifications';

    perform cron.schedule(
      'cleanup-old-user-notifications',
      '0 3 * * 0',
      $$select public.cleanup_old_user_notifications(interval '7 days');$$
    );
  end if;
exception
  when others then
    raise notice 'pg_cron notification cleanup skipped: %', sqlerrm;
end;
$schedule$;
