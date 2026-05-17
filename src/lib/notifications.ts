import { getSupabase, isP2pConfigured } from "@/lib/supabase";

/** Max notifications shown in the header dropdown. */
export const NOTIFICATION_DROPDOWN_LIMIT = 5;

/** Notifications older than this are removed by weekly DB cleanup. */
export const NOTIFICATION_RETENTION_DAYS = 7;

export type UserNotification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  trade_id: string | null;
  created_at: string;
  read_at: string | null;
};

export function notificationHref(href: string | null): string {
  if (!href) return "/account";
  if (href.startsWith("/")) return href;
  try {
    const url = new URL(href);
    return `${url.pathname}${url.hash}`;
  } catch {
    return "/account";
  }
}

export async function fetchMyNotifications(limit = NOTIFICATION_DROPDOWN_LIMIT): Promise<UserNotification[]> {
  const sb = getSupabase();
  if (!sb || !isP2pConfigured()) return [];

  const { data, error } = await sb
    .from("user_notifications")
    .select("id, user_id, kind, title, body, href, trade_id, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as UserNotification[];
}

function retentionCutoffIso(): string {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - NOTIFICATION_RETENTION_DAYS);
  return cutoff.toISOString();
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const sb = getSupabase();
  if (!sb || !isP2pConfigured()) return 0;

  const { count, error } = await sb
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .gte("created_at", retentionCutoffIso())
    .is("read_at", null);

  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { error } = await sb
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { error } = await sb
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) throw error;
}
