import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchAdminActivity,
  fetchAdminAuthQueue,
  fetchAdminListingsAnalytics,
  fetchAdminOrdersAnalytics,
  fetchAdminOverview,
  fetchAdminRevenueAnalytics,
  fetchAdminSearchAnalytics,
  fetchAdminSellers,
  fetchAdminUserGrowth,
  type AdminActivityRow,
  type AdminAuthQueue,
  type AdminDateRange,
  type AdminListingsAnalytics,
  type AdminOrdersAnalytics,
  type AdminOverview,
  type AdminRevenueAnalytics,
  type AdminSearchAnalytics,
  type AdminSellerRow,
  type AdminUserGrowth,
} from "@/lib/admin-analytics";
import {
  fetchAdminRecentListings,
  fetchAdminVerificationTrades,
  sendAdminTestEmail,
  type AdminListingStatus,
  type AdminRecentListing,
  type AdminVerificationTrade,
} from "@/lib/admin-verification";
import { useAuth } from "@/context/AuthContext";
import { formatMoney } from "@/lib/money-format";
import { moneyFromCents } from "@/lib/p2p";
import { isP2pConfigured } from "@/lib/supabase";
import { AdminVerificationPanel } from "@/pages/admin/AdminVerificationPanel";
import styles from "./AdminPage.module.css";

type TabId =
  | "home"
  | "growth"
  | "listings"
  | "orders"
  | "revenue"
  | "sellers"
  | "search"
  | "auth"
  | "activity";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "home", label: "Home" },
  { id: "growth", label: "User Growth" },
  { id: "listings", label: "Listings" },
  { id: "orders", label: "Orders" },
  { id: "revenue", label: "Revenue" },
  { id: "sellers", label: "Sellers" },
  { id: "search", label: "Search" },
  { id: "auth", label: "Auth Queue" },
  { id: "activity", label: "Live Activity" },
];

const LISTING_STATUS_OPTIONS: Array<"all" | AdminListingStatus> = [
  "all",
  "active",
  "reserved",
  "cancelled",
  "sold",
];

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

function usd(cents: number): string {
  return formatMoney(moneyFromCents(cents, "USD"));
}

function MiniBars({
  values,
  labels,
}: {
  values: number[];
  labels?: string[];
}) {
  const max = Math.max(1, ...values);
  if (!values.length) return <p className={styles.empty}>No data in this range yet.</p>;
  return (
    <div className={styles.barChart} role="img" aria-label="Trend chart">
      {values.map((value, index) => (
        <div key={`${labels?.[index] ?? index}-${value}`} className={styles.barCol} title={`${labels?.[index] ?? ""}: ${value}`}>
          <div className={styles.barFill} style={{ height: `${Math.max(4, (value / max) * 100)}%` }} />
          {labels?.[index] ? <span className={styles.barLabel}>{labels[index]}</span> : null}
        </div>
      ))}
    </div>
  );
}

function StatusTable({ data }: { data: Record<string, number> }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return <p className={styles.empty}>No rows yet.</p>;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Status</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([status, count]) => (
          <tr key={status}>
            <td>{prettyStatus(status)}</td>
            <td>{count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<TabId>("home");
  const [range, setRange] = useState<AdminDateRange>("30d");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [growth, setGrowth] = useState<AdminUserGrowth | null>(null);
  const [listingsAnalytics, setListingsAnalytics] = useState<AdminListingsAnalytics | null>(null);
  const [ordersAnalytics, setOrdersAnalytics] = useState<AdminOrdersAnalytics | null>(null);
  const [revenue, setRevenue] = useState<AdminRevenueAnalytics | null>(null);
  const [sellers, setSellers] = useState<AdminSellerRow[]>([]);
  const [searchAnalytics, setSearchAnalytics] = useState<AdminSearchAnalytics | null>(null);
  const [authQueue, setAuthQueue] = useState<AdminAuthQueue | null>(null);
  const [activity, setActivity] = useState<AdminActivityRow[]>([]);
  const [trades, setTrades] = useState<AdminVerificationTrade[]>([]);
  const [listings, setListings] = useState<AdminRecentListing[]>([]);
  const [listingQuery, setListingQuery] = useState("");
  const [listingStatus, setListingStatus] = useState<"all" | AdminListingStatus>("all");

  const [testRecipient, setTestRecipient] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testDetail, setTestDetail] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!isP2pConfigured() || !user) return;
    setLoading(true);
    setError(null);
    try {
      const [
        overviewRow,
        growthRow,
        listingsRow,
        ordersRow,
        revenueRow,
        sellersRow,
        searchRow,
        authRow,
        activityRow,
        tradeRows,
        listingRows,
      ] = await Promise.all([
        fetchAdminOverview(range),
        fetchAdminUserGrowth(range),
        fetchAdminListingsAnalytics(range),
        fetchAdminOrdersAnalytics(range),
        fetchAdminRevenueAnalytics(range),
        fetchAdminSellers(range),
        fetchAdminSearchAnalytics(range),
        fetchAdminAuthQueue(),
        fetchAdminActivity(80),
        fetchAdminVerificationTrades(),
        fetchAdminRecentListings(150),
      ]);
      setOverview(overviewRow);
      setGrowth(growthRow);
      setListingsAnalytics(listingsRow);
      setOrdersAnalytics(ordersRow);
      setRevenue(revenueRow);
      setSellers(sellersRow);
      setSearchAnalytics(searchRow);
      setAuthQueue(authRow);
      setActivity(activityRow);
      setTrades(tradeRows);
      setListings(listingRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load admin analytics");
    } finally {
      setLoading(false);
    }
  }, [range, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab !== "activity") return;
    const id = window.setInterval(() => {
      void fetchAdminActivity(80)
        .then(setActivity)
        .catch(() => undefined);
    }, 20000);
    return () => window.clearInterval(id);
  }, [tab]);

  const filteredListings = useMemo(() => {
    const q = listingQuery.trim().toLowerCase();
    return listings.filter((row) => {
      if (listingStatus !== "all" && row.status !== listingStatus) return false;
      if (!q) return true;
      return `${row.product_title ?? ""} ${row.product_handle} ${row.size_label} ${row.seller_email ?? ""} ${row.status} ${row.condition ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [listingQuery, listingStatus, listings]);

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

  if (!isP2pConfigured()) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Admin</h1>
        <p className={styles.lead}>Admin tools are unavailable until the backend is connected.</p>
      </div>
    );
  }

  if (authLoading) return <p className={styles.muted}>Loading...</p>;

  if (!user) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Admin</h1>
        <p className={styles.lead}>Sign in with an admin account to open the analytics dashboard.</p>
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
          <h1 className={styles.h1}>Analytics dashboard</h1>
          <p className={styles.lead}>
            User growth, listings, orders, revenue, sellers, search, auth queues, and live marketplace activity.
          </p>
        </div>
        <div className={styles.heroControls}>
          <label className={styles.rangeLabel}>
            Range
            <select className={styles.select} value={range} onChange={(e) => setRange(e.target.value as AdminDateRange)}>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </label>
          <button type="button" className={styles.ghostBtn} onClick={() => void refresh()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      <nav className={styles.tabs} aria-label="Admin sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? styles.tabOn : styles.tab}
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? <p className={styles.warn}>{error}</p> : null}

      {tab === "home" ? (
        <>
          <section className={styles.kpiGrid}>
            <div className={styles.metric}>
              <strong>{overview?.users_total ?? "—"}</strong>
              <span>Total users</span>
            </div>
            <div className={styles.metric}>
              <strong>{overview?.users_since ?? "—"}</strong>
              <span>New users (range)</span>
            </div>
            <div className={styles.metric}>
              <strong>{overview?.listings_active ?? "—"}</strong>
              <span>Active listings</span>
            </div>
            <div className={styles.metric}>
              <strong>{overview?.orders_paid_since ?? "—"}</strong>
              <span>Paid orders</span>
            </div>
            <div className={styles.metric}>
              <strong>{overview ? usd(overview.gmv_cents_since) : "—"}</strong>
              <span>GMV</span>
            </div>
            <div className={styles.metric}>
              <strong>{overview ? usd(overview.revenue_cents_since) : "—"}</strong>
              <span>Platform revenue</span>
            </div>
            <div className={styles.metric}>
              <strong>{overview?.users_unverified ?? "—"}</strong>
              <span>Unverified emails</span>
            </div>
            <div className={styles.metric}>
              <strong>{overview?.connect_incomplete ?? "—"}</strong>
              <span>Connect incomplete</span>
            </div>
          </section>

          <div className={styles.split}>
            <section className={styles.panel}>
              <div className={styles.sectionHead}>
                <p className={styles.eyebrow}>Growth</p>
                <h2 className={styles.sectionTitle}>Signups</h2>
              </div>
              <MiniBars
                values={(growth?.daily ?? []).map((d) => d.signups)}
                labels={(growth?.daily ?? []).map((d) => d.day.slice(5))}
              />
            </section>
            <section className={styles.panel}>
              <div className={styles.sectionHead}>
                <p className={styles.eyebrow}>Commerce</p>
                <h2 className={styles.sectionTitle}>Paid orders</h2>
              </div>
              <MiniBars
                values={(ordersAnalytics?.daily ?? []).map((d) => d.orders)}
                labels={(ordersAnalytics?.daily ?? []).map((d) => d.day.slice(5))}
              />
            </section>
            <section className={styles.panel}>
              <div className={styles.sectionHead}>
                <p className={styles.eyebrow}>Revenue</p>
                <h2 className={styles.sectionTitle}>Fees collected</h2>
              </div>
              <MiniBars
                values={(revenue?.daily ?? []).map((d) => d.total_cents / 100)}
                labels={(revenue?.daily ?? []).map((d) => d.day.slice(5))}
              />
            </section>
          </div>

          <section className={`${styles.panel} ${styles.emailTestPanel}`} aria-label="MailerSend test">
            <div className={styles.emailTestHead}>
              <p className={styles.eyebrow}>Diagnostics</p>
              <h2 className={styles.sectionTitle}>Send test email</h2>
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
            {testDetail !== null ? <pre className={styles.monoBlock}>{JSON.stringify(testDetail, null, 2)}</pre> : null}
          </section>
        </>
      ) : null}

      {tab === "growth" ? (
        <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Users</p>
            <h2 className={styles.sectionTitle}>User growth</h2>
            <p className={styles.lead}>
              Verified {growth?.verified_total ?? 0} · Unverified {growth?.unverified_total ?? 0}
            </p>
          </div>
          <MiniBars
            values={(growth?.daily ?? []).map((d) => d.signups)}
            labels={(growth?.daily ?? []).map((d) => d.day.slice(5))}
          />
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Joined</th>
                <th>Email</th>
                <th>Name</th>
                <th>Verified</th>
              </tr>
            </thead>
            <tbody>
              {(growth?.recent ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{shortDate(row.created_at)}</td>
                  <td>{row.email ?? row.id}</td>
                  <td>{row.display_name ?? "—"}</td>
                  <td>{row.email_verified ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "listings" ? (
        <>
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Marketplace</p>
              <h2 className={styles.sectionTitle}>Listings analytics</h2>
            </div>
            <div className={styles.split}>
              <div>
                <h3 className={styles.subTitle}>By status</h3>
                <StatusTable data={listingsAnalytics?.by_status ?? {}} />
              </div>
              <div>
                <h3 className={styles.subTitle}>Creates over time</h3>
                <MiniBars
                  values={(listingsAnalytics?.daily ?? []).map((d) => d.created)}
                  labels={(listingsAnalytics?.daily ?? []).map((d) => d.day.slice(5))}
                />
              </div>
            </div>
            <h3 className={styles.subTitle}>Top products</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Brand</th>
                  <th>Listings</th>
                </tr>
              </thead>
              <tbody>
                {(listingsAnalytics?.top_products ?? []).map((row) => (
                  <tr key={row.product_handle}>
                    <td>
                      <Link to={`/product/${encodeURIComponent(row.product_handle)}`}>
                        {row.product_title ?? row.product_handle}
                      </Link>
                    </td>
                    <td>{row.brand ?? "—"}</td>
                    <td>{row.listings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className={styles.panel} aria-label="Recent listings">
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Feed</p>
              <h2 className={styles.sectionTitle}>Recent listings</h2>
            </div>
            <div className={styles.toolbar}>
              <input
                className={styles.search}
                placeholder="Search product, seller, size, status"
                value={listingQuery}
                onChange={(e) => setListingQuery(e.target.value)}
              />
              <select
                className={styles.select}
                value={listingStatus}
                onChange={(e) => setListingStatus(e.target.value as "all" | AdminListingStatus)}
              >
                {LISTING_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? "All listing statuses" : prettyStatus(option)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.stack}>
              {filteredListings.length === 0 ? <p className={styles.empty}>No listings match those filters.</p> : null}
              {filteredListings.map((row) => {
                const title = row.product_title?.trim() || row.product_handle;
                const thumb = row.photo_urls[0] || row.product_image_url;
                return (
                  <article key={row.id} className={styles.tradeCard}>
                    <div className={styles.listingTop}>
                      {thumb ? (
                        <a href={thumb} target="_blank" rel="noreferrer" className={styles.listingThumb}>
                          <img src={thumb} alt="" loading="lazy" />
                        </a>
                      ) : (
                        <div className={styles.listingThumbEmpty} aria-hidden>
                          —
                        </div>
                      )}
                      <div className={styles.listingBody}>
                        <div className={styles.tradeTop}>
                          <div>
                            <h3 className={styles.title}>
                              <Link to={`/product/${encodeURIComponent(row.product_handle)}`}>{title}</Link>
                              <span className={styles.pill}>{row.size_label}</span>
                            </h3>
                            <p className={styles.small}>
                              Seller {row.seller_email ?? row.seller_id} • Listed {shortDate(row.created_at)}
                            </p>
                          </div>
                          <span className={styles.status}>{prettyStatus(row.status)}</span>
                        </div>
                        <div className={styles.details}>
                          <span>
                            Ask
                            <strong>{formatMoney(moneyFromCents(row.price_cents, row.currency))}</strong>
                          </span>
                          <span>
                            Condition
                            <strong>{prettyCondition(row.condition)}</strong>
                          </span>
                          <span>
                            Photos
                            <strong>{row.photo_urls.length}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      {tab === "orders" ? (
        <>
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Orders</p>
              <h2 className={styles.sectionTitle}>Order funnel & GMV</h2>
            </div>
            <div className={styles.split}>
              <div>
                <h3 className={styles.subTitle}>By status</h3>
                <StatusTable data={ordersAnalytics?.by_status ?? {}} />
              </div>
              <div>
                <h3 className={styles.subTitle}>Paid orders / day</h3>
                <MiniBars
                  values={(ordersAnalytics?.daily ?? []).map((d) => d.orders)}
                  labels={(ordersAnalytics?.daily ?? []).map((d) => d.day.slice(5))}
                />
              </div>
            </div>
          </section>
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Ops</p>
              <h2 className={styles.sectionTitle}>Verification queue</h2>
              <p className={styles.lead}>Move paid trades through shipment, verification, delivery, and payout.</p>
            </div>
            <AdminVerificationPanel
              trades={trades}
              loading={loading}
              onRefresh={() => void refresh()}
              onError={setError}
            />
          </section>
        </>
      ) : null}

      {tab === "revenue" ? (
        <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Money</p>
            <h2 className={styles.sectionTitle}>Revenue</h2>
          </div>
          <div className={styles.kpiGrid}>
            <div className={styles.metric}>
              <strong>{revenue ? usd(revenue.buyer_fee_cents) : "—"}</strong>
              <span>Buyer processing fees</span>
            </div>
            <div className={styles.metric}>
              <strong>{revenue ? usd(revenue.seller_fee_cents) : "—"}</strong>
              <span>Seller fees</span>
            </div>
            <div className={styles.metric}>
              <strong>{revenue ? usd(revenue.total_revenue_cents) : "—"}</strong>
              <span>Total platform revenue</span>
            </div>
            <div className={styles.metric}>
              <strong>{revenue ? usd(revenue.payouts_released_cents) : "—"}</strong>
              <span>Payouts released</span>
            </div>
          </div>
          <MiniBars
            values={(revenue?.daily ?? []).map((d) => d.total_cents / 100)}
            labels={(revenue?.daily ?? []).map((d) => d.day.slice(5))}
          />
        </section>
      ) : null}

      {tab === "sellers" ? (
        <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Supply</p>
            <h2 className={styles.sectionTitle}>Sellers</h2>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Seller</th>
                <th>Listings</th>
                <th>Sold</th>
                <th>GMV</th>
                <th>Seller fees</th>
                <th>Connect</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((row) => (
                <tr key={row.seller_id}>
                  <td>
                    <div>{row.seller_email ?? row.seller_id}</div>
                    <div className={styles.small}>{row.display_name ?? ""}</div>
                  </td>
                  <td>{row.listings}</td>
                  <td>{row.sold}</td>
                  <td>{usd(row.gmv_cents)}</td>
                  <td>{usd(row.seller_fee_cents)}</td>
                  <td>
                    {!row.stripe_account_id
                      ? "Not connected"
                      : row.stripe_payouts_enabled
                        ? "Payouts on"
                        : "Onboarding incomplete"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sellers.length ? <p className={styles.empty}>No sellers in this range yet.</p> : null}
        </section>
      ) : null}

      {tab === "search" ? (
        <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Discovery</p>
            <h2 className={styles.sectionTitle}>Search analytics</h2>
            <p className={styles.lead}>{searchAnalytics?.total_events ?? 0} search events in range.</p>
          </div>
          <div className={styles.split}>
            <div>
              <h3 className={styles.subTitle}>Top queries</h3>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Query</th>
                    <th>Searches</th>
                    <th>Avg results</th>
                    <th>Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {(searchAnalytics?.top_queries ?? []).map((row) => (
                    <tr key={row.query}>
                      <td>{row.query}</td>
                      <td>{row.searches}</td>
                      <td>{row.avg_results}</td>
                      <td>{row.clicks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!searchAnalytics?.top_queries?.length ? (
                <p className={styles.empty}>No searches logged yet — data starts accumulating after deploy.</p>
              ) : null}
            </div>
            <div>
              <h3 className={styles.subTitle}>Zero-result queries</h3>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Query</th>
                    <th>Searches</th>
                  </tr>
                </thead>
                <tbody>
                  {(searchAnalytics?.zero_result_queries ?? []).map((row) => (
                    <tr key={row.query}>
                      <td>{row.query}</td>
                      <td>{row.searches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <h3 className={styles.subTitle}>Recent searches</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Query</th>
                <th>Results</th>
                <th>Clicked</th>
              </tr>
            </thead>
            <tbody>
              {(searchAnalytics?.recent ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{shortDate(row.created_at)}</td>
                  <td>{row.query}</td>
                  <td>{row.result_count}</td>
                  <td>{row.clicked_handle ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "auth" ? (
        <div className={styles.split}>
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Auth</p>
              <h2 className={styles.sectionTitle}>Unverified emails</h2>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Joined</th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Token expires</th>
                </tr>
              </thead>
              <tbody>
                {(authQueue?.unverified ?? []).map((row) => (
                  <tr key={row.id}>
                    <td>{shortDate(row.created_at)}</td>
                    <td>{row.email ?? row.id}</td>
                    <td>{row.display_name ?? "—"}</td>
                    <td>{shortDate(row.email_verify_token_expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!authQueue?.unverified?.length ? <p className={styles.empty}>No unverified users.</p> : null}
          </section>
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Payouts</p>
              <h2 className={styles.sectionTitle}>Stripe Connect incomplete</h2>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Seller</th>
                  <th>Listings</th>
                  <th>Sales</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(authQueue?.connect_incomplete ?? []).map((row) => (
                  <tr key={row.seller_id}>
                    <td>
                      <div>{row.seller_email ?? row.seller_id}</div>
                      <div className={styles.small}>{row.display_name ?? ""}</div>
                    </td>
                    <td>{row.listings}</td>
                    <td>{row.sales}</td>
                    <td>{row.stripe_account_id ? "Onboarding incomplete" : "Not connected"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!authQueue?.connect_incomplete?.length ? <p className={styles.empty}>No Connect gaps.</p> : null}
          </section>
        </div>
      ) : null}

      {tab === "activity" ? (
        <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Realtime</p>
            <h2 className={styles.sectionTitle}>Live activity feed</h2>
            <p className={styles.lead}>Auto-refreshes about every 20 seconds while this tab is open.</p>
          </div>
          <ul className={styles.activityList}>
            {activity.map((row, index) => (
              <li key={`${row.at}-${row.kind}-${row.subject}-${index}`} className={styles.activityItem}>
                <span className={styles.activityTime}>{shortDate(row.at)}</span>
                <span className={styles.pill}>{prettyStatus(row.kind)}</span>
                <strong>{row.subject}</strong>
                <span className={styles.small}>{row.detail}</span>
              </li>
            ))}
          </ul>
          {!activity.length ? <p className={styles.empty}>No recent activity.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
