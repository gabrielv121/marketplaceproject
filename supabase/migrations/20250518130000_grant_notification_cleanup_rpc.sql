-- Allow cleanup-pending-trades (service role) to purge old notifications.

grant execute on function public.cleanup_old_user_notifications(interval) to service_role;
