import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { CatalogProductImage } from "@/components/CatalogProductImage";
import { useAuth } from "@/context/AuthContext";
import { fetchMyAddresses, fetchMyProfile, type ProfileAddressRow, type ProfileRow } from "@/lib/account-data";
import { createBuyerOutboundLabel, releaseSellerPayout } from "@/lib/admin-verification";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import { fetchCatalogSummaryByHandle } from "@/lib/catalog-supabase";
import { resolveFeaturedImageUrl } from "@/lib/catalog-images";
import { startCheckoutForTrade } from "@/lib/checkout";
import { formatMoney } from "@/lib/money-format";
import { moneyFromCents, rpcSellerMarkTradeShipped } from "@/lib/p2p";
import { createSellerInboundLabel, type SellerShipAddress } from "@/lib/shipping-labels";
import { isP2pConfigured } from "@/lib/supabase";
import { fetchTradeDetail, type TradeDetailRow, type TradeDetailRole } from "@/lib/trade-detail";
import styles from "./TradeDetailPage.module.css";

type TimelineStep = {
  key: string;
  label: string;
  detail: string;
  date: keyof TradeDetailRow;
};
type TimelineState = "done" | "current" | "upcoming" | "failed";

const BUYER_TIMELINE: TimelineStep[] = [
  { key: "seller_notified", label: "Paid", detail: "EXCH. is holding your payment.", date: "paid_at" },
  { key: "seller_shipped_to_exch", label: "Seller shipped", detail: "Seller is sending the item to EXCH.", date: "seller_shipped_at" },
  { key: "received_by_exch", label: "Received by EXCH.", detail: "The item arrived for inspection.", date: "received_by_exch_at" },
  { key: "verification_passed", label: "Verified", detail: "Authenticity and condition passed.", date: "verified_at" },
  { key: "shipped_to_buyer", label: "On the way", detail: "EXCH. shipped the item to you.", date: "shipped_to_buyer_at" },
  { key: "delivered_to_buyer", label: "Delivered", detail: "The order was delivered.", date: "delivered_to_buyer_at" },
];

const SELLER_TIMELINE: TimelineStep[] = [
  { key: "seller_notified", label: "Sale paid", detail: "Buyer payment is held by EXCH.", date: "paid_at" },
  { key: "seller_shipped_to_exch", label: "Ship to EXCH.", detail: "Send your item with the prepaid label.", date: "seller_shipped_at" },
  { key: "received_by_exch", label: "EXCH. received", detail: "We have the item for verification.", date: "received_by_exch_at" },
  { key: "verification_passed", label: "Verified", detail: "Item passed verification.", date: "verified_at" },
  { key: "shipped_to_buyer", label: "Sent to buyer", detail: "EXCH. shipped the item to the buyer.", date: "shipped_to_buyer_at" },
  { key: "delivered_to_buyer", label: "Delivered", detail: "Buyer delivery confirmed.", date: "delivered_to_buyer_at" },
  { key: "payout_available", label: "Payout available", detail: "Seller payout can be released.", date: "payout_available_at" },
  { key: "payout_paid", label: "Paid out", detail: "Payout was sent to your Stripe account.", date: "payout_paid_at" },
];

function prettyStatus(status: string): string {
  return status.replaceAll("_", " ");
}

function shortDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function buyerTotalCents(row: TradeDetailRow): number {
  return row.buyer_total_cents ?? row.price_cents + (row.buyer_shipping_cents ?? 0);
}

function sellerPayoutCents(row: TradeDetailRow): number {
  return row.seller_net_payout_cents ?? Math.max(row.price_cents - (row.seller_fee_cents ?? 0) - (row.seller_inbound_label_cents ?? 0), 0);
}

function timelineIndex(row: TradeDetailRow, steps: TimelineStep[]): number {
  if (row.status === "paid") return 0;
  if (row.status === "completed") return steps.length - 1;
  const index = steps.findIndex((step) => step.key === row.status);
  return index >= 0 ? index : 0;
}

function timelineState(row: TradeDetailRow, step: TimelineStep, index: number, steps: TimelineStep[]): TimelineState {
  if (row.status === "verification_failed" || row.status === "refunded") {
    const failedAt = steps.findIndex((item) => item.key === "verification_passed");
    return index < failedAt ? "done" : "upcoming";
  }
  if (row.status === "payout_failed") {
    const failedAt = steps.findIndex((item) => item.key === "payout_available");
    return index <= failedAt ? "done" : "upcoming";
  }
  const current = timelineIndex(row, steps);
  if (index < current) return "done";
  if (step.key === row.status || (row.status === "paid" && index === 0)) return "current";
  if (index === current && row.status === "completed") return "done";
  return "upcoming";
}

function timelineDate(row: TradeDetailRow, key: keyof TradeDetailRow): string | null {
  const value = row[key];
  return typeof value === "string" && value ? shortDate(value) : null;
}

function countryCode(country: string): string {
  const normalized = country.trim().toLowerCase();
  if (normalized === "united states" || normalized === "usa") return "US";
  if (normalized === "canada") return "CA";
  return country.trim().toUpperCase();
}

function missingSellerShipFields(address: ProfileAddressRow | undefined, phone: string | null | undefined): string[] {
  if (!address) return ["shipping address"];
  const missing: string[] = [];
  if (!address.name.trim()) missing.push("recipient name");
  if (!address.line1.trim()) missing.push("address line 1");
  if (!address.city.trim()) missing.push("city");
  if (!address.region.trim()) missing.push("state");
  if (!address.postal.trim()) missing.push("ZIP");
  if (!address.country.trim()) missing.push("country");
  if (!phone?.trim()) missing.push("phone number");
  return missing;
}

function sellerShipAddress(
  address: ProfileAddressRow | undefined,
  profile: ProfileRow | null,
  email?: string | null,
): SellerShipAddress | null {
  if (!address) return null;
  return {
    name: address.name.trim() || profile?.display_name?.trim() || email?.split("@")[0] || "Seller",
    street1: address.line1.trim(),
    street2: address.line2.trim() || undefined,
    city: address.city.trim(),
    state: address.region.trim(),
    zip: address.postal.trim(),
    country: countryCode(address.country),
    phone: profile?.phone?.trim() || undefined,
    email: email ?? undefined,
  };
}

function roleLabel(role: TradeDetailRole): string {
  if (role === "buyer") return "Buyer view";
  if (role === "seller") return "Seller view";
  return "Admin view";
}

function addressSummary(row: TradeDetailRow): string {
  const parts = [
    row.buyer_shipping_name,
    row.buyer_shipping_line1,
    row.buyer_shipping_line2,
    [row.buyer_shipping_city, row.buyer_shipping_state, row.buyer_shipping_postal_code].filter(Boolean).join(", "),
    row.buyer_shipping_country,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Buyer shipping address not captured yet.";
}

function StatusTimeline({ row, role }: { row: TradeDetailRow; role: TradeDetailRole }) {
  const steps = role === "buyer" ? BUYER_TIMELINE : SELLER_TIMELINE;
  return (
    <ol className={styles.timeline} aria-label={`${role} trade timeline`}>
      {steps.map((step, index) => {
        const state = timelineState(row, step, index, steps);
        return (
          <li key={step.key} className={`${styles.timelineStep} ${styles[`timelineStep_${state}`]}`}>
            <span className={styles.timelineDot} aria-hidden />
            <span>
              <strong>{step.label}</strong>
              <small>{timelineDate(row, step.date) ?? step.detail}</small>
            </span>
          </li>
        );
      })}
      {row.status === "verification_failed" ? (
        <li className={`${styles.timelineStep} ${styles.timelineStep_failed}`}>
          <span className={styles.timelineDot} aria-hidden />
          <span>
            <strong>Verification failed</strong>
            <small>EXCH. will handle the refund/return process.</small>
          </span>
        </li>
      ) : null}
      {row.status === "payout_failed" ? (
        <li className={`${styles.timelineStep} ${styles.timelineStep_failed}`}>
          <span className={styles.timelineDot} aria-hidden />
          <span>
            <strong>Payout failed</strong>
            <small>EXCH. will retry or contact the seller.</small>
          </span>
        </li>
      ) : null}
    </ol>
  );
}

export function TradeDetailPage() {
  const { tradeId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [trade, setTrade] = useState<TradeDetailRow | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [addresses, setAddresses] = useState<ProfileAddressRow[]>([]);
  const [product, setProduct] = useState<CatalogProductSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tradeId || !user) return;
    setLoading(true);
    setError(null);
    try {
      const row = await fetchTradeDetail(tradeId);
      setTrade(row);
      const [profileRow, addressRows, catalogProduct] = await Promise.all([
        fetchMyProfile(),
        fetchMyAddresses(),
        fetchCatalogSummaryByHandle(row.product_handle),
      ]);
      setProfile(profileRow);
      setAddresses(addressRows);
      setProduct(catalogProduct);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load trade");
    } finally {
      setLoading(false);
    }
  }, [tradeId, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const defaultAddress = useMemo(() => addresses.find((address) => address.is_default) ?? addresses[0], [addresses]);

  const onResumeCheckout = () => {
    if (!trade) return;
    setBusy("checkout");
    setError(null);
    void startCheckoutForTrade(trade.id, window.location.origin)
      .then((url) => window.location.assign(url))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not resume checkout"))
      .finally(() => setBusy(null));
  };

  const onCreateSellerLabel = () => {
    if (!trade) return;
    const missing = missingSellerShipFields(defaultAddress, profile?.phone);
    if (missing.length > 0) {
      setError(`Complete your seller ship-from info in Account first: ${missing.join(", ")}.`);
      return;
    }
    const shipFrom = sellerShipAddress(defaultAddress, profile, user?.email);
    if (!shipFrom) {
      setError("Add a shipping address in Account before creating a prepaid label.");
      return;
    }
    setBusy("seller-label");
    setError(null);
    void createSellerInboundLabel(trade.id, shipFrom)
      .then((label) => {
        setNotice(
          label.email_sent
            ? "Shipping label created and emailed to the seller."
            : `Shipping label created.${label.email_error ? ` Email was not sent: ${label.email_error}` : ""}`,
        );
        void refresh();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not create shipping label"))
      .finally(() => setBusy(null));
  };

  const onMarkSellerShipped = () => {
    if (!trade) return;
    setBusy("seller-shipped");
    setError(null);
    void rpcSellerMarkTradeShipped(trade.id)
      .then(() => {
        setNotice("Marked shipped to EXCH. The trade will update again when the item is received.");
        void refresh();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not mark item shipped"))
      .finally(() => setBusy(null));
  };

  const onCreateBuyerLabel = () => {
    if (!trade) return;
    setBusy("buyer-label");
    setError(null);
    void createBuyerOutboundLabel(trade.id)
      .then(() => {
        setNotice("Buyer label created.");
        void refresh();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not create buyer label"))
      .finally(() => setBusy(null));
  };

  const onReleasePayout = () => {
    if (!trade) return;
    setBusy("payout");
    setError(null);
    void releaseSellerPayout(trade.id)
      .then(() => {
        setNotice("Seller payout released.");
        void refresh();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not release payout"))
      .finally(() => setBusy(null));
  };

  if (!isP2pConfigured()) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Trade detail</h1>
        <p className={styles.lead}>Supabase is not configured yet.</p>
      </div>
    );
  }

  if (authLoading || loading) return <p className={styles.muted}>Loading trade...</p>;

  if (!user) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Trade detail</h1>
        <p className={styles.lead}>Sign in to view this trade.</p>
        <Link to={`/login?next=/trade/${tradeId ?? ""}`} className={styles.btn}>
          Sign in
        </Link>
      </div>
    );
  }

  if (!trade) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Trade detail</h1>
        {error ? <p className={styles.warn}>{error}</p> : <p className={styles.lead}>Trade not found.</p>}
        <BackButton fallback="/account" className={styles.ghostBtn}>
          Back
        </BackButton>
      </div>
    );
  }

  const canResumeCheckout = trade.role === "buyer" && (trade.status === "reserved" || trade.status === "pending_payment");
  const canCreateSellerLabel = trade.role === "seller" && (trade.status === "paid" || trade.status === "seller_notified") && !trade.seller_label_url;
  const canMarkSellerShipped =
    trade.role === "seller" &&
    Boolean(trade.seller_label_url) &&
    (trade.status === "paid" || trade.status === "seller_notified");
  const canCreateBuyerLabel = trade.access === "admin" && trade.status === "verification_passed" && !trade.buyer_label_url;
  const canReleasePayout = trade.access === "admin" && trade.status === "payout_available";
  const canOpenSellerLabel =
    Boolean(trade.seller_label_url) && (trade.role === "seller" || trade.access === "admin");
  const canOpenBuyerLabel =
    Boolean(trade.buyer_label_url) && (trade.role === "buyer" || trade.access === "admin");

  return (
    <div className={styles.page}>
      <BackButton fallback="/account" className={styles.backLink}>
        ← Back
      </BackButton>
      <section className={styles.hero}>
        <div className={styles.productMedia}>
          {product && resolveFeaturedImageUrl(product) ? (
            <CatalogProductImage product={product} className={styles.productImage} loading="eager" />
          ) : (
            <span className={styles.productPlaceholder}>EX</span>
          )}
        </div>
        <div>
          <p className={styles.eyebrow}>{roleLabel(trade.role)}</p>
          <h1 className={styles.h1}>{product?.title ?? trade.product_handle}</h1>
          <p className={styles.lead}>
            Size {trade.size_label} · Created {shortDate(trade.created_at)}
          </p>
          <div className={styles.heroActions}>
            <span className={styles.status}>{prettyStatus(trade.status)}</span>
            <Link to={`/product/${trade.product_handle}`} className={styles.ghostBtn}>
              View item
            </Link>
            <Link to="/account" className={styles.ghostBtn}>
              Account
            </Link>
          </div>
        </div>
      </section>

      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {error ? <p className={styles.warn}>{error}</p> : null}

      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.kicker}>Progress</p>
              <h2 className={styles.h2}>Trade timeline</h2>
            </div>
          </div>
          <StatusTimeline row={trade} role={trade.role} />
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.kicker}>Next</p>
              <h2 className={styles.h2}>Actions</h2>
            </div>
          </div>
          <div className={styles.actionStack}>
            {canResumeCheckout ? (
              <button type="button" className={styles.payBtn} disabled={busy === "checkout"} onClick={onResumeCheckout}>
                {busy === "checkout" ? "Opening..." : "Resume payment"}
              </button>
            ) : null}
            {canOpenSellerLabel ? (
              <a className={styles.payBtn} href={trade.seller_label_url!} target="_blank" rel="noreferrer">
                Open seller label
              </a>
            ) : null}
            {canCreateSellerLabel ? (
              <button type="button" className={styles.payBtn} disabled={busy === "seller-label"} onClick={onCreateSellerLabel}>
                {busy === "seller-label" ? "Creating..." : "Create seller label"}
              </button>
            ) : null}
            {canMarkSellerShipped ? (
              <button type="button" className={styles.ghostBtn} disabled={busy === "seller-shipped"} onClick={onMarkSellerShipped}>
                {busy === "seller-shipped" ? "Saving..." : "Mark shipped to EXCH."}
              </button>
            ) : null}
            {canOpenBuyerLabel ? (
              <a className={styles.ghostBtn} href={trade.buyer_label_url!} target="_blank" rel="noreferrer">
                Open buyer label
              </a>
            ) : null}
            {canCreateBuyerLabel ? (
              <button type="button" className={styles.payBtn} disabled={busy === "buyer-label"} onClick={onCreateBuyerLabel}>
                {busy === "buyer-label" ? "Creating..." : "Create buyer label"}
              </button>
            ) : null}
            {canReleasePayout ? (
              <button type="button" className={styles.payBtn} disabled={busy === "payout"} onClick={onReleasePayout}>
                {busy === "payout" ? "Releasing..." : "Release payout"}
              </button>
            ) : null}
            {trade.access === "admin" ? (
              <Link to="/admin" className={styles.ghostBtn}>
                Manage in admin dashboard
              </Link>
            ) : null}
            {!canResumeCheckout &&
            !canCreateSellerLabel &&
            !canMarkSellerShipped &&
            !canCreateBuyerLabel &&
            !canReleasePayout &&
            !canOpenSellerLabel &&
            !canOpenBuyerLabel ? (
              <p className={styles.empty}>No action needed from you right now.</p>
            ) : null}
          </div>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>Money</p>
            <h2 className={styles.h2}>Payment and payout</h2>
          </div>
        </div>
        <div className={styles.detailGrid}>
          <span>
            Item price
            <strong>{formatMoney(moneyFromCents(trade.price_cents, trade.currency))}</strong>
          </span>
          <span>
            Buyer shipping
            <strong>{formatMoney(moneyFromCents(trade.buyer_shipping_cents ?? 0, trade.currency))}</strong>
          </span>
          <span>
            Buyer total
            <strong>{formatMoney(moneyFromCents(buyerTotalCents(trade), trade.currency))}</strong>
          </span>
          <span>
            Seller payout estimate
            <strong>{formatMoney(moneyFromCents(sellerPayoutCents(trade), trade.currency))}</strong>
          </span>
          <span>
            Payout status
            <strong>{trade.stripe_transfer_id ?? trade.stripe_transfer_error ?? prettyStatus(trade.status)}</strong>
          </span>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>Shipping</p>
            <h2 className={styles.h2}>Labels and tracking</h2>
          </div>
        </div>
        <div className={styles.detailGrid}>
          <span>
            Seller label
            <strong>{trade.seller_label_carrier ?? trade.seller_label_service ?? (trade.seller_label_url ? "Created" : "Not created")}</strong>
          </span>
          <span>
            Seller tracking
            <strong>{trade.seller_tracking_number ?? "Not set"}</strong>
          </span>
          <span>
            Buyer label
            <strong>{trade.buyer_label_carrier ?? trade.buyer_label_service ?? (trade.buyer_label_url ? "Created" : "Not created")}</strong>
          </span>
          <span>
            Buyer tracking
            <strong>{trade.buyer_tracking_number ?? "Not set"}</strong>
          </span>
        </div>
        <p className={styles.addressLine}>{addressSummary(trade)}</p>
      </section>

      {trade.verification_notes ? (
        <section className={styles.panel}>
          <p className={styles.kicker}>Verification notes</p>
          <p className={styles.note}>{trade.verification_notes}</p>
        </section>
      ) : null}
    </div>
  );
}
