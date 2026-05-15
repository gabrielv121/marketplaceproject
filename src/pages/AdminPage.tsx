import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ReturnLink } from "@/components/ReturnLink";
import { useAuth } from "@/context/AuthContext";
import {
  createBuyerOutboundLabel,
  fetchAdminVerificationTrades,
  releaseSellerPayout,
  sendAdminTestEmail,
  updateAdminTradeStatus,
  type AdminTradeStatus,
  type AdminVerificationTrade,
} from "@/lib/admin-verification";
import { formatMoney } from "@/lib/money-format";
import { moneyFromCents } from "@/lib/p2p";
import { isP2pConfigured } from "@/lib/supabase";
import styles from "./AdminPage.module.css";

type Draft = {
  notes: string;
  sellerTracking: string;
  buyerTracking: string;
};

const STATUS_OPTIONS: Array<"all" | AdminTradeStatus> = [
  "all",
  "reserved",
  "pending_payment",
  "paid",
  "seller_notified",
  "seller_shipped_to_exch",
  "received_by_exch",
  "verification_passed",
  "verification_failed",
  "shipped_to_buyer",
  "delivered_to_buyer",
  "payout_available",
  "payout_paid",
  "cancelled",
  "refunded",
];

const NEXT_ACTIONS: Partial<Record<AdminTradeStatus, { label: string; status: AdminTradeStatus; danger?: boolean }[]>> = {
  paid: [{ label: "Notify seller", status: "seller_notified" }],
  seller_notified: [{ label: "Mark seller shipped", status: "seller_shipped_to_exch" }],
  seller_shipped_to_exch: [{ label: "Mark received", status: "received_by_exch" }],
  received_by_exch: [
    { label: "Pass verification", status: "verification_passed" },
    { label: "Fail verification", status: "verification_failed", danger: true },
  ],
  shipped_to_buyer: [{ label: "Mark delivered", status: "delivered_to_buyer" }],
  delivered_to_buyer: [{ label: "Make payout available", status: "payout_available" }],
  payout_available: [{ label: "Release payout", status: "payout_paid" }],
};

function prettyStatus(status: string): string {
  return status.replaceAll("_", " ");
}

function prettyCondition(condition: string | null): string {
  if (!condition) return "Not provided";
  return condition.replaceAll("_", " ");
}

function shortDate(value: string | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );
}

function tradeTotal(row: AdminVerificationTrade): string {
  const total = row.buyer_total_cents || row.price_cents + row.buyer_shipping_cents;
  return formatMoney(moneyFromCents(total, row.currency));
}

function payout(row: AdminVerificationTrade): string {
  return formatMoney(moneyFromCents(row.seller_net_payout_cents || row.price_cents, row.currency));
}

function actionBlocker(row: AdminVerificationTrade, nextStatus: AdminTradeStatus): string | null {
  if (nextStatus === "seller_shipped_to_exch" && !row.seller_tracking_number && !row.seller_label_url) {
    return "Seller shipment needs a label or tracking number first.";
  }
  if (nextStatus === "received_by_exch" && !row.seller_shipped_at && !row.seller_tracking_number) {
    return "Mark seller shipped before receiving the item.";
  }
  if ((nextStatus === "verification_passed" || nextStatus === "verification_failed") && !row.received_by_exch_at) {
    return "Receive the item before verification.";
  }
  if (nextStatus === "shipped_to_buyer" && (!row.buyer_label_url || !row.buyer_tracking_number)) {
    return "Create the buyer label before marking shipped.";
  }
  if (nextStatus === "delivered_to_buyer" && !row.buyer_tracking_number) {
    return "Buyer tracking is required before delivery.";
  }
  if (nextStatus === "payout_available" && !row.delivered_to_buyer_at) {
    return "Confirm buyer delivery before making payout available.";
  }
  return null;
}

function visibleActions(row: AdminVerificationTrade): Array<{ label: string; status: AdminTradeStatus; danger?: boolean }> {
  if (row.status === "verification_passed") return [];
  return NEXT_ACTIONS[row.status] ?? [];
}

export function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [trades, setTrades] = useState<AdminVerificationTrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | AdminTradeStatus>("all");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [testRecipient, setTestRecipient] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testDetail, setTestDetail] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!isP2pConfigured() || !user) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAdminVerificationTrades();
      setTrades(rows);
      setDrafts((current) => {
        const next = { ...current };
        for (const row of rows) {
          next[row.id] ??= {
            notes: row.verification_notes ?? "",
            sellerTracking: row.seller_tracking_number ?? "",
            buyerTracking: row.buyer_tracking_number ?? "",
          };
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load admin trades");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trades.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return `${row.product_handle} ${row.size_label} ${row.buyer_email ?? ""} ${row.seller_email ?? ""} ${row.status}`
        .toLowerCase()
        .includes(q);
    });
  }, [query, status, trades]);

  const counts = useMemo(() => {
    const active = trades.filter(
      (row) => !["reserved", "pending_payment", "cancelled", "payout_paid", "completed", "refunded", "verification_failed"].includes(row.status),
    );
    return {
      total: trades.length,
      active: active.length,
      payout: trades.filter((row) => row.status === "payout_available").length,
    };
  }, [trades]);

  const setDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((current) => {
      const previous = current[id] ?? { notes: "", sellerTracking: "", buyerTracking: "" };
      return { ...current, [id]: { ...previous, ...patch } };
    });
  };

  const onMove = (row: AdminVerificationTrade, nextStatus: AdminTradeStatus) => {
    const draft = drafts[row.id] ?? { notes: "", sellerTracking: "", buyerTracking: "" };
    setBusyId(`${row.id}-${nextStatus}`);
    setError(null);
    void updateAdminTradeStatus(row.id, {
      status: nextStatus,
      verificationNotes: draft.notes,
      sellerTrackingNumber: draft.sellerTracking,
      buyerTrackingNumber: draft.buyerTracking,
    })
      .then(() => void refresh())
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not update trade"))
      .finally(() => setBusyId(null));
  };

  const onReleasePayout = (row: AdminVerificationTrade) => {
    setBusyId(`${row.id}-payout_paid`);
    setError(null);
    void releaseSellerPayout(row.id)
      .then(() => void refresh())
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not release payout"))
      .finally(() => setBusyId(null));
  };

  const onSendTestEmail = () => {
    setTestBusy(true);
    setTestMessage(null);
    setTestDetail(null);
    void sendAdminTestEmail(testRecipient.trim() || undefined)
      .then((r) => {
        if (r.ok) {
          setTestMessage(`Test email accepted for ${r.to ?? "your inbox"}.`);
          setTestDetail({
            transport: r.transport,
            smtp_message_id: r.smtpMessageId,
            mailersend_request_id: r.mailersendRequestId,
            config_check: r.configCheck,
            domains_check: r.domainsCheck,
            detail: r.detail,
          });
        } else {
          setTestMessage(r.error ?? "MailerSend did not accept the message.");
          setTestDetail({
            transport: r.transport,
            mailersend_status: r.status,
            smtp_message_id: r.smtpMessageId,
            mailersend_request_id: r.mailersendRequestId,
            config_check: r.configCheck,
            auth_hint: r.authHint,
            domains_check: r.domainsCheck,
            detail: r.detail,
          });
        }
      })
      .catch((e: unknown) => {
        setTestMessage(e instanceof Error ? e.message : "Could not send test email");
      })
      .finally(() => setTestBusy(false));
  };

  const onCreateBuyerLabel = (row: AdminVerificationTrade) => {
    const busyKey = `${row.id}-buyer-label`;
    setBusyId(busyKey);
    setError(null);
    setRowErrors((current) => ({ ...current, [row.id]: "" }));
    void createBuyerOutboundLabel(row.id)
      .then(() => {
        void refresh();
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Could not create buyer label";
        setError(message);
        setRowErrors((current) => ({ ...current, [row.id]: message }));
      })
      .finally(() => setBusyId(null));
  };

  if (!isP2pConfigured()) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Admin</h1>
        <p className={styles.lead}>Supabase is not configured yet.</p>
      </div>
    );
  }

  if (authLoading) return <p className={styles.muted}>Loading...</p>;

  if (!user) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Admin</h1>
        <p className={styles.lead}>Sign in with an admin account to manage verification.</p>
        <Link to="/login" className={styles.btn}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Admin</p>
          <h1 className={styles.h1}>Verification dashboard</h1>
          <p className={styles.lead}>
            Move paid trades through seller shipment, EXCH. verification, buyer delivery, and payout readiness.
          </p>
        </div>
        <div className={styles.metrics}>
          <div className={styles.metric}>
            <strong>{counts.total}</strong>
            <span>Total trades</span>
          </div>
          <div className={styles.metric}>
            <strong>{counts.active}</strong>
            <span>In workflow</span>
          </div>
          <div className={styles.metric}>
            <strong>{counts.payout}</strong>
            <span>Payout ready</span>
          </div>
        </div>
      </section>

      <section className={`${styles.panel} ${styles.emailTestPanel}`} aria-label="MailerSend test">
        <div className={styles.emailTestHead}>
          <p className={styles.eyebrow}>Diagnostics</p>
          <h2>Send test email</h2>
          <p className={styles.lead}>
            Uses <code className={styles.inlineCode}>send-test-email</code>. Set Supabase Edge secrets (not{" "}
            <code className={styles.inlineCode}>.env.local</code>): <code className={styles.inlineCode}>NOTIFICATION_FROM_EMAIL</code>{" "}
            plus SMTP (<code className={styles.inlineCode}>SMTP_USER</code>,{" "}
            <code className={styles.inlineCode}>SMTP_PASSWORD</code>) or API (
            <code className={styles.inlineCode}>MAILERSEND_API_KEY</code>). Response shows{" "}
            <code className={styles.inlineCode}>transport</code>: <code className={styles.inlineCode}>smtp</code> or{" "}
            <code className={styles.inlineCode}>mailersend_api</code>.
          </p>
        </div>
        <div className={styles.emailTestRow}>
          <input
            className={styles.input}
            type="email"
            placeholder={`Optional override (defaults to ${user.email ?? "your email"})`}
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            autoComplete="email"
          />
          <button type="button" className={styles.btn} disabled={testBusy} onClick={() => void onSendTestEmail()}>
            {testBusy ? "Sending…" : "Send test email"}
          </button>
        </div>
        {testMessage ? <p className={testMessage.includes("accepted") ? styles.okNote : styles.warn}>{testMessage}</p> : null}
        {testDetail !== null ? (
          <pre className={styles.monoBlock}>{JSON.stringify(testDetail, null, 2)}</pre>
        ) : null}
      </section>

      {error ? <p className={styles.warn}>{error}</p> : null}

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <input
            className={styles.search}
            placeholder="Search product, buyer, seller, status"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value as "all" | AdminTradeStatus)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All statuses" : prettyStatus(option)}
              </option>
            ))}
          </select>
          <button type="button" className={styles.ghostBtn} onClick={() => void refresh()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className={styles.stack}>
          {filtered.length === 0 ? <p className={styles.empty}>No trades match those filters.</p> : null}
          {filtered.map((row) => {
            const draft = drafts[row.id] ?? { notes: "", sellerTracking: "", buyerTracking: "" };
            const actions = visibleActions(row);
            return (
              <article key={row.id} className={styles.tradeCard}>
                <div className={styles.tradeTop}>
                  <div>
                    <h2 className={styles.title}>
                      {row.product_handle}
                      <span className={styles.pill}>{row.size_label}</span>
                    </h2>
                    <p className={styles.small}>
                      Buyer {row.buyer_email ?? row.buyer_id} • Seller {row.seller_email ?? row.seller_id}
                    </p>
                  </div>
                  <span className={styles.status}>{prettyStatus(row.status)}</span>
                </div>

                <div className={styles.details}>
                  <span>
                    Buyer total
                    <strong>{tradeTotal(row)}</strong>
                  </span>
                  <span>
                    Seller payout estimate
                    <strong>{payout(row)}</strong>
                  </span>
                  <span>
                    Stripe transfer
                    <strong>{row.stripe_transfer_id ?? row.stripe_transfer_error ?? "Not released"}</strong>
                  </span>
                  <span>
                    Paid
                    <strong>{shortDate(row.paid_at)}</strong>
                  </span>
                  <span>
                    Seller label
                    <strong>
                      {row.seller_label_url ? (
                        <a href={row.seller_label_url} target="_blank" rel="noreferrer">
                          {row.seller_label_carrier ?? "Open label"}
                        </a>
                      ) : (
                        "Not created"
                      )}
                    </strong>
                  </span>
                  <span>
                    Seller tracking
                    <strong>{row.seller_tracking_number ?? "Not set"}</strong>
                  </span>
                  <span>
                    Buyer tracking
                    <strong>{row.buyer_tracking_number ?? "Not set"}</strong>
                  </span>
                  <span>
                    Buyer label
                    <strong>
                      {row.buyer_label_url ? (
                        <a href={row.buyer_label_url} target="_blank" rel="noreferrer">
                          {row.buyer_label_carrier ?? "Open label"}
                        </a>
                      ) : (
                        "Not created"
                      )}
                    </strong>
                  </span>
                  <span>
                    Buyer ship-to
                    <strong>
                      {row.buyer_shipping_line1
                        ? `${row.buyer_shipping_city ?? ""}, ${row.buyer_shipping_state ?? ""} ${row.buyer_shipping_postal_code ?? ""}`
                        : "Not captured"}
                    </strong>
                  </span>
                </div>

                <section className={styles.reviewBox} aria-label="Seller listing review">
                  <div className={styles.reviewHead}>
                    <div>
                      <p className={styles.eyebrow}>Listing review</p>
                      <h3>Photos and seller details</h3>
                    </div>
                    <span className={styles.pill}>{prettyCondition(row.listing_condition)}</span>
                  </div>
                  {row.listing_photo_urls?.length ? (
                    <div className={styles.photoGrid}>
                      {row.listing_photo_urls.map((url, index) => (
                        <a key={`${row.id}-photo-${index}`} href={url} target="_blank" rel="noreferrer" className={styles.photoLink}>
                          <img src={url} alt={`Seller listing photo ${index + 1}`} loading="lazy" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.empty}>No seller photos were uploaded for this listing.</p>
                  )}
                  <div className={styles.reviewDetails}>
                    <span>
                      Box included
                      <strong>{row.listing_box_included ? "Yes" : "No"}</strong>
                    </span>
                    <span>
                      SKU / style code
                      <strong>{row.listing_sku ?? "Not provided"}</strong>
                    </span>
                    <span>
                      Requirements accepted
                      <strong>{shortDate(row.listing_verification_requirements_accepted_at)}</strong>
                    </span>
                  </div>
                  {row.listing_defects ? (
                    <p className={styles.reviewNote}>
                      <strong>Defects / wear</strong>
                      {row.listing_defects}
                    </p>
                  ) : null}
                  {row.listing_seller_notes ? (
                    <p className={styles.reviewNote}>
                      <strong>Seller notes</strong>
                      {row.listing_seller_notes}
                    </p>
                  ) : null}
                </section>

                <div className={styles.actions}>
                  <label>
                    <span className={styles.small}>Tracking numbers</span>
                    <input
                      className={styles.input}
                      placeholder="Seller-to-EXCH tracking"
                      value={draft.sellerTracking}
                      onChange={(e) => setDraft(row.id, { sellerTracking: e.target.value })}
                    />
                    <input
                      className={styles.input}
                      placeholder="EXCH-to-buyer tracking"
                      value={draft.buyerTracking}
                      onChange={(e) => setDraft(row.id, { buyerTracking: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className={styles.small}>Verification notes</span>
                    <textarea
                      className={styles.textarea}
                      value={draft.notes}
                      onChange={(e) => setDraft(row.id, { notes: e.target.value })}
                      placeholder="Condition/authenticity notes"
                    />
                  </label>
                  {rowErrors[row.id] ? <p className={styles.warn}>{rowErrors[row.id]}</p> : null}
                  <div className={styles.buttonRow}>
                    <ReturnLink to={`/trade/${row.id}`} className={styles.ghostBtn}>
                      View details
                    </ReturnLink>
                    {row.buyer_label_url ? (
                      <a className={styles.ghostBtn} href={row.buyer_label_url} target="_blank" rel="noreferrer">
                        Open buyer label
                      </a>
                    ) : null}
                    {row.status === "verification_passed" ? (
                      <button
                        type="button"
                        className={styles.btn}
                        disabled={busyId === `${row.id}-buyer-label`}
                        onClick={() => onCreateBuyerLabel(row)}
                      >
                        {busyId === `${row.id}-buyer-label` ? "Creating label..." : "Create buyer label"}
                      </button>
                    ) : null}
                    {actions.map((action) => {
                      const blocker = actionBlocker(row, action.status);
                      return (
                        <button
                          key={action.status}
                          type="button"
                          className={action.danger ? styles.dangerBtn : styles.btn}
                          disabled={Boolean(blocker) || busyId === `${row.id}-${action.status}`}
                          title={blocker ?? undefined}
                          onClick={() =>
                            row.status === "payout_available" && action.status === "payout_paid"
                              ? onReleasePayout(row)
                              : onMove(row, action.status)
                          }
                        >
                          {busyId === `${row.id}-${action.status}` ? "Saving..." : action.label}
                        </button>
                      );
                    })}
                    {actions.length === 0 ? <span className={styles.muted}>No next action</span> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
