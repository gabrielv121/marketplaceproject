import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconBell } from "@/components/HeaderIcons";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationHref,
} from "@/lib/notifications";
import { isP2pConfigured } from "@/lib/supabase";
import styles from "./NotificationBell.module.css";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items, unreadCount, loading, refresh, setItems, setUnreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  if (!user || !isP2pConfigured()) return null;

  const onOpenItem = (id: string, href: string | null, read: boolean) => {
    setOpen(false);
    if (!read) {
      void markNotificationRead(id).then(() => {
        setItems((current) =>
          current.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      });
    }
    navigate(notificationHref(href));
  };

  const onMarkAll = () => {
    if (unreadCount === 0) return;
    void markAllNotificationsRead().then(() => {
      const now = new Date().toISOString();
      setItems((current) => current.map((n) => ({ ...n, read_at: n.read_at ?? now })));
      setUnreadCount(0);
      void refresh();
    });
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      {open ? <button type="button" className={styles.backdrop} aria-label="Close notifications" onClick={() => setOpen(false)} /> : null}
      <button
        type="button"
        className={open ? `${styles.btn} ${styles.btnOpen}` : styles.btn}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell width={20} height={20} />
        {unreadCount > 0 ? (
          <span className={styles.badge} aria-hidden>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Notifications">
          <div className={styles.head}>
            <strong>Notifications</strong>
            <button type="button" className={styles.markAll} disabled={unreadCount === 0} onClick={onMarkAll}>
              Mark all read
            </button>
          </div>
          <div className={styles.list}>
            {loading && items.length === 0 ? <p className={styles.empty}>Loading…</p> : null}
            {!loading && items.length === 0 ? <p className={styles.empty}>No notifications yet.</p> : null}
            {items.slice(0, 12).map((n) => {
              const unread = !n.read_at;
              return (
                <button
                  key={n.id}
                  type="button"
                  className={unread ? `${styles.item} ${styles.itemUnread}` : styles.item}
                  onClick={() => onOpenItem(n.id, n.href, !unread)}
                >
                  <span className={styles.itemTitle}>{n.title}</span>
                  <span className={styles.itemBody}>{n.body}</span>
                  <span className={styles.itemTime}>{formatWhen(n.created_at)}</span>
                </button>
              );
            })}
          </div>
          <div className={styles.foot}>
            <Link to="/account#notifications" className={styles.footLink} onClick={() => setOpen(false)}>
              View all on Account
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
