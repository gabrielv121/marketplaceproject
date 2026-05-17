import { useNavigate } from "react-router-dom";
import { useNotifications } from "@/hooks/useNotifications";
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationHref,
} from "@/lib/notifications";
import styles from "./AccountNotifications.module.css";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AccountNotifications() {
  const navigate = useNavigate();
  const { items, unreadCount, loading, refresh, setItems, setUnreadCount } = useNotifications();

  const onOpen = (id: string, href: string | null, read: boolean) => {
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
    void markAllNotificationsRead().then(() => {
      const now = new Date().toISOString();
      setItems((current) => current.map((n) => ({ ...n, read_at: n.read_at ?? now })));
      setUnreadCount(0);
      void refresh();
    });
  };

  return (
    <section className={styles.panel} id="notifications" aria-labelledby="notifications-heading">
      <div className={styles.head}>
        <div>
          <p className={styles.kicker}>Alerts</p>
          <h2 className={styles.h2} id="notifications-heading">
            Notifications
          </h2>
          <p className={styles.lead}>Order updates, bids, labels, and payouts appear here and in the header bell.</p>
        </div>
        {unreadCount > 0 ? (
          <button type="button" className={styles.markAll} onClick={onMarkAll}>
            Mark all read ({unreadCount})
          </button>
        ) : null}
      </div>

      {loading && items.length === 0 ? <p className={styles.empty}>Loading notifications…</p> : null}
      {!loading && items.length === 0 ? (
        <p className={styles.empty}>No notifications yet. You will see updates when you buy, sell, or match bids.</p>
      ) : null}

      <ul className={styles.list}>
        {items.map((n) => {
          const unread = !n.read_at;
          return (
            <li key={n.id}>
              <button
                type="button"
                className={unread ? `${styles.item} ${styles.itemUnread}` : styles.item}
                onClick={() => onOpen(n.id, n.href, !unread)}
              >
                <span className={styles.itemTop}>
                  <strong>{n.title}</strong>
                  <time dateTime={n.created_at}>{formatWhen(n.created_at)}</time>
                </span>
                <span className={styles.body}>{n.body}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
