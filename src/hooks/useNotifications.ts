import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  fetchMyNotifications,
  fetchUnreadNotificationCount,
  type UserNotification,
} from "@/lib/notifications";
import { getSupabase, isP2pConfigured } from "@/lib/supabase";

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || !isP2pConfigured()) {
      setItems([]);
      setUnreadCount(0);
      return;
    }
    setLoading(true);
    try {
      const [list, count] = await Promise.all([fetchMyNotifications(50), fetchUnreadNotificationCount()]);
      setItems(list);
      setUnreadCount(count);
    } catch {
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user || !isP2pConfigured()) return;

    const sb = getSupabase();
    if (!sb) return;

    const channel = sb
      .channel(`user-notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      void sb.removeChannel(channel);
    };
  }, [user, refresh]);

  return { items, unreadCount, loading, refresh, setItems, setUnreadCount };
}
