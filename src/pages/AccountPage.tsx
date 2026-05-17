import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ReturnLink } from "@/components/ReturnLink";
import { useAuth } from "@/context/AuthContext";
import {
  fetchMyBids,
  fetchMyAddresses,
  fetchMyListings,
  fetchMyProfile,
  fetchMyTrades,
  updateMyProfile,
  upsertMyAddress,
  type MyBidRow,
  type MyListingRow,
  type MyTradeRow,
  type ProfileAddressRow,
} from "@/lib/account-data";
import {
  confirmCheckoutSession,
  notifyBidMatch,
  startCheckoutForTrade,
  startSellerOnboarding,
} from "@/lib/checkout";
import { loadCatalogProducts } from "@/lib/catalog-products";
import { fetchMyFavoriteHandles } from "@/lib/favorites";
import { formatMoney } from "@/lib/money-format";
import { parseToCents } from "@/lib/money-parse";
import {
  moneyFromCents,
  rpcCancelBid,
  rpcCancelListing,
  rpcUpdateBid,
  rpcCancelReservedTrade,
  rpcSellListingToBid,
  rpcSellerMarkTradeShipped,
  rpcUpdateActiveListing,
  uploadListingPhotos,
  type ListingCondition,
} from "@/lib/p2p";
import { createSellerInboundLabel, type SellerShipAddress } from "@/lib/shipping-labels";
import { isP2pConfigured } from "@/lib/supabase";
import styles from "./AccountPage.module.css";

type Address = {
  id: string;
  label: string;
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal: string;
  country: string;
  isDefault: boolean;
};

type HistoryItem = {
  id: string;
  created_at: string;
  title: string;
  detail: string;
  amount: string;
  status: string;
  to?: string;
};

type ProductPreview = {
  title: string;
  imageUrl: string | null;
};

type ListingEditDraft = {
  price: string;
  condition: ListingCondition;
  photoUrls: string[];
  newPhotos: File[];
  defects: string;
  boxIncluded: boolean;
  sku: string;
  sellerNotes: string;
  verificationAccepted: boolean;
};

type SettingKey = "orderEmails" | "priceAlerts" | "sellerAlerts" | "marketing" | "twoFactor" | "privateProfile";
type TimelineRole = "buyer" | "seller";
type TimelineState = "done" | "current" | "upcoming" | "failed";
type TimelineStep = {
  key: string;
  label: string;
  detail: string;
  date?: string | null;
};

const emptyAddress: Omit<Address, "id"> = {
  label: "Home",
  name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postal: "",
  country: "United States",
  isDefault: true,
};

const CONDITION_LABELS: Record<ListingCondition, string> = {
  new: "New / unworn",
  new_with_defects: "New with defects",
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
};

function prettyStatus(status: string): string {
  return status.replaceAll("_", " ");
}

const BUYER_ORDER_STATUSES = new Set([
  "paid",
  "seller_notified",
  "seller_shipped_to_exch",
  "received_by_exch",
  "verification_passed",
  "shipped_to_buyer",
  "delivered_to_buyer",
  "payout_available",
  "payout_paid",
  "completed",
]);
const SELLER_PENDING_STATUSES = new Set([
  "paid",
  "seller_notified",
  "seller_shipped_to_exch",
  "received_by_exch",
  "verification_passed",
  "shipped_to_buyer",
  "delivered_to_buyer",
  "payout_available",
]);
const SELLER_HISTORY_STATUSES = new Set(["verification_failed", "payout_paid", "completed", "cancelled", "refunded"]);
const SELLER_SALE_STATUSES = new Set([...BUYER_ORDER_STATUSES]);
const SELLER_LEVEL_SALE_STEP = 10;
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

function sellerActionCopy(status: string): string {
  if (status === "paid" || status === "seller_notified") return "Ship this item to EXCH. for verification.";
  if (status === "seller_shipped_to_exch") return "Waiting for EXCH. to receive the item.";
  if (status === "received_by_exch") return "EXCH. is verifying authenticity and condition.";
  if (status === "verification_passed") return "Verified. EXCH. will ship this item to the buyer.";
  if (status === "shipped_to_buyer") return "In transit to buyer.";
  if (status === "delivered_to_buyer") return "Delivered. Payout will become available.";
  if (status === "payout_available") return "Payout available once your payout method is ready.";
  return prettyStatus(status);
}

function buyerTradeTotalCents(row: MyTradeRow): number {
  return row.buyer_total_cents ?? row.price_cents + (row.buyer_shipping_cents ?? 0);
}

function sellerNetPayoutCents(row: MyTradeRow): number {
  return row.seller_net_payout_cents ?? Math.max(row.price_cents - (row.seller_fee_cents ?? 0) - (row.seller_inbound_label_cents ?? 0), 0);
}

function draftFromListing(row: MyListingRow): ListingEditDraft {
  return {
    price: (row.price_cents / 100).toFixed(2),
    condition: (row.condition as ListingCondition | null) ?? "new",
    photoUrls: row.photo_urls ?? [],
    newPhotos: [],
    defects: row.defects ?? "",
    boxIncluded: Boolean(row.box_included),
    sku: row.sku ?? "",
    sellerNotes: row.seller_notes ?? "",
    verificationAccepted: Boolean(row.verification_requirements_accepted_at),
  };
}

function timelineIndex(row: MyTradeRow, steps: TimelineStep[]): number {
  if (row.status === "paid") return 0;
  if (row.status === "completed") return steps.length - 1;
  const index = steps.findIndex((step) => step.key === row.status);
  return index >= 0 ? index : 0;
}

function timelineState(row: MyTradeRow, step: TimelineStep, index: number, steps: TimelineStep[]): TimelineState {
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

function timelineDate(row: MyTradeRow, key: string | null | undefined): string | null {
  if (!key) return null;
  const value = row[key as keyof MyTradeRow];
  return typeof value === "string" && value ? shortDate(value) : null;
}

function StatusTimeline({ row, role }: { row: MyTradeRow; role: TimelineRole }) {
  const steps = role === "buyer" ? BUYER_TIMELINE : SELLER_TIMELINE;
  return (
    <ol className={styles.timeline} aria-label={`${role} order timeline`}>
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

function isTradeRow(row: MyListingRow | MyTradeRow): row is MyTradeRow {
  return "buyer_id" in row && "seller_id" in row;
}

function countryCode(country: string): string {
  const normalized = country.trim().toLowerCase();
  if (normalized === "united states" || normalized === "usa") return "US";
  if (normalized === "canada") return "CA";
  return country.trim().toUpperCase();
}

function addressFromRow(row: ProfileAddressRow): Address {
  return {
    id: row.id,
    label: row.label,
    name: row.name,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    region: row.region,
    postal: row.postal,
    country: row.country,
    isDefault: row.is_default,
  };
}

function rowFromAddress(address: Address, id?: string): Omit<ProfileAddressRow, "id" | "created_at"> & { id?: string } {
  const row = {
    label: address.label,
    name: address.name,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    region: address.region,
    postal: address.postal,
    country: address.country,
    is_default: address.isDefault,
  };
  return id ? { ...row, id } : row;
}

function sellerShipAddress(address: Address | undefined, name: string, phone: string, email?: string | null): SellerShipAddress | null {
  if (!address) return null;
  return {
    name: address.name.trim() || name.trim() || email?.split("@")[0] || "Seller",
    street1: address.line1.trim(),
    street2: address.line2.trim() || undefined,
    city: address.city.trim(),
    state: address.region.trim(),
    zip: address.postal.trim(),
    country: countryCode(address.country),
    phone: phone.trim() || undefined,
    email: email ?? undefined,
  };
}

function missingSellerShipFields(address: Address | undefined, phone: string): string[] {
  if (!address) return ["shipping address"];

  const missing: string[] = [];
  if (!address.name.trim()) missing.push("recipient name");
  if (!address.line1.trim()) missing.push("address line 1");
  if (!address.city.trim()) missing.push("city");
  if (!address.region.trim()) missing.push("state");
  if (!address.postal.trim()) missing.push("ZIP");
  if (!address.country.trim()) missing.push("country");
  if (!phone.trim()) missing.push("phone number");
  return missing;
}

function shortDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(date));
}

const LEVEL_HINT_VISIBLE_MS = 2800;

function SellerLevelBadge({ level, salesToNext }: { level: number; salesToNext: number }) {
  const [hintOpen, setHintOpen] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hint = `${salesToNext} sales to LV${level + 1}`;

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  const revealHint = () => {
    setHintOpen(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      setHintOpen(false);
      hintTimerRef.current = null;
    }, LEVEL_HINT_VISIBLE_MS);
  };

  return (
    <button
      type="button"
      className={`${styles.sellerLevelWrap} ${hintOpen ? styles.sellerLevelWrapHintOpen : ""}`.trim()}
      aria-label={`Seller level ${level}`}
      aria-expanded={hintOpen}
      onClick={revealHint}
    >
      <span className={styles.levelBadge} aria-hidden>
        LV{level}
      </span>
      <small className={styles.sellerLevelHint}>{hint}</small>
    </button>
  );
}

export function AccountPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const p2p = isP2pConfigured();
  const [displayName, setDisplayName] = useState("");
  const [listings, setListings] = useState<MyListingRow[]>([]);
  const [bids, setBids] = useState<MyBidRow[]>([]);
  const [trades, setTrades] = useState<MyTradeRow[]>([]);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [checkoutBanner, setCheckoutBanner] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [shoeSize, setShoeSize] = useState("US 10");
  const [apparelSize, setApparelSize] = useState("M");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [productPreviews, setProductPreviews] = useState<Record<string, ProductPreview>>({});
  const [favoriteHandles, setFavoriteHandles] = useState<string[]>([]);
  const [showAllFavorites, setShowAllFavorites] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressDraft, setAddressDraft] = useState<Omit<Address, "id">>(emptyAddress);
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [listingDrafts, setListingDrafts] = useState<Record<string, ListingEditDraft>>({});
  const [historyQuery, setHistoryQuery] = useState("");
  const [historySort, setHistorySort] = useState<"newest" | "oldest">("newest");
  const [settings, setSettings] = useState<Record<SettingKey, boolean>>({
    orderEmails: true,
    priceAlerts: true,
    sellerAlerts: true,
    marketing: false,
    twoFactor: false,
    privateProfile: false,
  });
  const confirmingSessionIdsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!p2p || !user) return;
    setLoadError(null);
    try {
      const [p, savedAddresses, l, b, t, f] = await Promise.all([
        fetchMyProfile(),
        fetchMyAddresses(),
        fetchMyListings(),
        fetchMyBids(),
        fetchMyTrades(),
        fetchMyFavoriteHandles(),
      ]);
      setDisplayName(p?.display_name ?? "");
      setPhone(p?.phone ?? "");
      setStripeAccountId(p?.stripe_account_id ?? null);
      setUsername((current) => current || p?.display_name?.toLowerCase().replace(/\s+/g, "") || user.email?.split("@")[0] || "");
      setAddresses(savedAddresses.map(addressFromRow));
      setListings(l);
      setBids(b);
      setTrades(t);
      setFavoriteHandles(f);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load account");
    }
  }, [p2p, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void loadCatalogProducts({ limit: 2000 })
      .then(({ products }) => {
        if (cancelled) return;
        setProductPreviews(
          Object.fromEntries(
            products.map((product) => [
              product.handle,
              {
                title: product.title,
                imageUrl: product.featuredImageUrl,
              },
            ]),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setProductPreviews({});
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const c = q.get("checkout");
    const connect = q.get("connect");
    const cancelledTradeId = q.get("trade_id");
    const checkoutSessionId = q.get("session_id");
    if (c === "success") {
      setCheckoutBanner(
        "Payment received. Confirming the order with Stripe...",
      );
      if (checkoutSessionId) {
        void confirmCheckoutSession(checkoutSessionId)
          .then(() => {
            setCheckoutBanner("Payment confirmed. EXCH. is holding funds while the seller ships the item to us for verification.");
            void refresh();
          })
          .catch((e: unknown) => {
            setCheckoutBanner(e instanceof Error ? e.message : "Payment succeeded, but the order could not be confirmed.");
            void refresh();
          });
      }
    } else if (c === "cancel") {
      if (cancelledTradeId) {
        void rpcCancelReservedTrade(cancelledTradeId)
          .then(() => {
            setCheckoutBanner("Checkout was canceled and the item was released back for sale.");
            void refresh();
          })
          .catch((e: unknown) => {
            setCheckoutBanner(e instanceof Error ? e.message : "Checkout was canceled, but the reservation could not be released.");
            void refresh();
          });
      } else {
        setCheckoutBanner(
          "Checkout was canceled. You can try again from the product page if the listing is still available.",
        );
      }
    } else if (connect === "return") {
      setCheckoutBanner("Stripe onboarding returned. Refreshing your seller payout status.");
    } else if (connect === "refresh") {
      setCheckoutBanner("Stripe onboarding link expired. Click Connect Stripe again to continue.");
    } else {
      return;
    }
    navigate("/account", { replace: true });
    void refresh();
  }, [location.search, navigate, refresh]);

  const onSaveProfile = () => {
    setSaveMsg(null);
    setSaving(true);
    void updateMyProfile({ displayName, phone })
      .then(() => {
        setSaveMsg("Saved.");
        void refresh();
      })
      .catch((e: unknown) => setSaveMsg(e instanceof Error ? e.message : "Save failed"))
      .finally(() => setSaving(false));
  };

  const onCancelListing = (id: string) => {
    setBusyId(id);
    void rpcCancelListing(id)
      .then(() => void refresh())
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Cancel failed"))
      .finally(() => setBusyId(null));
  };

  const onCancelBid = (id: string) => {
    setBusyId(id);
    void rpcCancelBid(id)
      .then(() => void refresh())
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Could not cancel bid"))
      .finally(() => setBusyId(null));
  };

  const onIncreaseBid = (row: MyBidRow) => {
    const next = window.prompt(
      `New max bid for ${row.size_label} (${row.currency})`,
      String(Math.ceil(row.max_price_cents / 100) + 10),
    );
    if (next == null) return;
    const cents = parseToCents(next);
    if (cents == null) {
      setLoadError("Enter a valid price.");
      return;
    }
    if (cents <= row.max_price_cents) {
      setLoadError("New max must be higher than your current bid.");
      return;
    }
    setBusyId(row.id);
    void rpcUpdateBid(row.id, cents)
      .then(async (result) => {
        if (result.matched && result.tradeId) {
          setSaveMsg("Bid matched — opening checkout…");
          void notifyBidMatch(result.tradeId, window.location.origin);
          const url = await startCheckoutForTrade(result.tradeId, window.location.origin);
          window.location.assign(url);
          return;
        }
        setSaveMsg("Bid increased.");
        void refresh();
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Could not update bid"))
      .finally(() => setBusyId(null));
  };

  const onSellListingToBid = (listingId: string) => {
    setBusyId(listingId);
    void rpcSellListingToBid(listingId)
      .then((tradeId) => {
        void notifyBidMatch(tradeId, window.location.origin);
        setSaveMsg("Matched to highest open bid. The buyer can complete checkout from Account → Buying.");
        void refresh();
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Could not sell to bid"))
      .finally(() => setBusyId(null));
  };

  const onEditListing = (row: MyListingRow) => {
    if (row.status !== "active") return;
    setListingDrafts((current) => ({ ...current, [row.id]: current[row.id] ?? draftFromListing(row) }));
    setEditingListingId(row.id);
  };

  const updateListingDraft = (id: string, patch: Partial<ListingEditDraft>) => {
    setListingDrafts((current) => {
      const listing = listings.find((row) => row.id === id);
      const previous = current[id] ?? (listing ? draftFromListing(listing) : undefined);
      if (!previous) return current;
      return { ...current, [id]: { ...previous, ...patch } };
    });
  };

  const onChooseListingPhotos = (id: string, files: FileList | null) => {
    if (!files) return;
    const listing = listings.find((row) => row.id === id);
    const draft = listingDrafts[id] ?? (listing ? draftFromListing(listing) : undefined);
    if (!draft) return;
    const existingCount = draft.photoUrls.length + draft.newPhotos.length;
    const next = Array.from(files).slice(0, Math.max(0, 6 - existingCount));
    updateListingDraft(id, { newPhotos: [...draft.newPhotos, ...next] });
  };

  const onSaveListing = (row: MyListingRow) => {
    const draft = listingDrafts[row.id] ?? draftFromListing(row);
    const priceCents = parseToCents(draft.price);
    if (priceCents == null) {
      setRowErrors((current) => ({ ...current, [row.id]: "Enter a valid listing price." }));
      return;
    }
    if (draft.photoUrls.length + draft.newPhotos.length === 0) {
      setRowErrors((current) => ({ ...current, [row.id]: "Keep at least one listing photo." }));
      return;
    }
    if ((draft.condition === "new_with_defects" || draft.condition === "fair") && !draft.defects.trim()) {
      setRowErrors((current) => ({ ...current, [row.id]: "Describe defects or wear for this condition." }));
      return;
    }
    if (!draft.verificationAccepted) {
      setRowErrors((current) => ({ ...current, [row.id]: "Accept verification requirements before saving." }));
      return;
    }

    setBusyId(`listing-${row.id}`);
    setRowErrors((current) => ({ ...current, [row.id]: "" }));
    void uploadListingPhotos(draft.newPhotos, row.id)
      .then((newUrls) =>
        rpcUpdateActiveListing({
          listingId: row.id,
          priceCents,
          condition: draft.condition,
          photoUrls: [...draft.photoUrls, ...newUrls],
          defects: draft.defects,
          boxIncluded: draft.boxIncluded,
          sku: draft.sku,
          sellerNotes: draft.sellerNotes,
          verificationAccepted: draft.verificationAccepted,
        }),
      )
      .then(() => {
        setEditingListingId(null);
        setCheckoutBanner("Listing updated.");
        void refresh();
      })
      .catch((e: unknown) => {
        setRowErrors((current) => ({ ...current, [row.id]: e instanceof Error ? e.message : "Could not update listing" }));
      })
      .finally(() => setBusyId(null));
  };

  const onStartSellerOnboarding = () => {
    setLoadError(null);
    setBusyId("connect");
    void startSellerOnboarding(window.location.origin)
      .then((url) => window.location.assign(url))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Could not start seller onboarding"))
      .finally(() => setBusyId(null));
  };

  const onResumeCheckout = (tradeId: string) => {
    setLoadError(null);
    setBusyId(tradeId);
    void startCheckoutForTrade(tradeId, window.location.origin)
      .then((url) => window.location.assign(url))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Could not resume checkout"))
      .finally(() => setBusyId(null));
  };

  const onCreateSellerLabel = (trade: MyTradeRow) => {
    const selectedAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
    const missingFields = missingSellerShipFields(selectedAddress, phone);
    if (missingFields.length > 0) {
      const message = `Complete your seller ship-from info before creating a label: ${missingFields.join(", ")}.`;
      setLoadError(message);
      setRowErrors((current) => ({ ...current, [trade.id]: message }));
      return;
    }

    const shipFrom = sellerShipAddress(selectedAddress, displayName, phone, user?.email);
    if (!shipFrom) {
      const message = "Add a shipping address in Account before creating a prepaid label.";
      setLoadError(message);
      setRowErrors((current) => ({ ...current, [trade.id]: message }));
      return;
    }
    setLoadError(null);
    setRowErrors((current) => ({ ...current, [trade.id]: "" }));
    setBusyId(`label-${trade.id}`);
    void createSellerInboundLabel(trade.id, shipFrom)
      .then((label) => {
        setCheckoutBanner(
          label.email_sent
            ? "Shipping label created and emailed to the seller."
            : `Shipping label created. Use Open label from this row to view or print it.${label.email_error ? ` Email was not sent: ${label.email_error}` : ""}`,
        );
        void refresh();
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Could not create shipping label";
        setLoadError(message);
        setRowErrors((current) => ({ ...current, [trade.id]: message }));
      })
      .finally(() => setBusyId(null));
  };

  const onMarkSellerShipped = (trade: MyTradeRow) => {
    setLoadError(null);
    setRowErrors((current) => ({ ...current, [trade.id]: "" }));
    setBusyId(`ship-${trade.id}`);
    void rpcSellerMarkTradeShipped(trade.id)
      .then(() => {
        setCheckoutBanner("Marked shipped to EXCH. We will update the trade again when the item is received.");
        void refresh();
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Could not mark item shipped";
        setLoadError(message);
        setRowErrors((current) => ({ ...current, [trade.id]: message }));
      })
      .finally(() => setBusyId(null));
  };

  const onAddAddress = () => {
    setAddressDraft({ ...emptyAddress, name: displayName || user?.email?.split("@")[0] || "" });
    setEditingAddressId("new");
  };

  const onEditAddress = (address: Address) => {
    setAddressDraft({
      label: address.label,
      name: address.name,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      region: address.region,
      postal: address.postal,
      country: address.country,
      isDefault: address.isDefault,
    });
    setEditingAddressId(address.id);
  };

  const onSaveAddress = () => {
    if (!editingAddressId) return;
    const next: Address = {
      id: editingAddressId === "new" ? "" : editingAddressId,
      ...addressDraft,
    };
    setLoadError(null);
    void upsertMyAddress(rowFromAddress(next, editingAddressId === "new" ? undefined : editingAddressId))
      .then(() => {
        setEditingAddressId(null);
        void refresh();
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Could not save address"));
  };

  const toggleSetting = (key: SettingKey) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  };

  const buyerTrades = useMemo(() => trades.filter((row) => row.role === "buyer"), [trades]);
  const sellerTrades = useMemo(() => trades.filter((row) => row.role === "seller"), [trades]);
  const orders = useMemo(() => buyerTrades.filter((row) => BUYER_ORDER_STATUSES.has(row.status)), [buyerTrades]);
  const pendingBuying = useMemo(
    () => buyerTrades.filter((row) => row.status === "reserved" || row.status === "pending_payment"),
    [buyerTrades],
  );

  useEffect(() => {
    if (!p2p || !user || pendingBuying.length === 0) return;

    const sessionIds = Array.from(
      new Set(
        pendingBuying
          .map((row) => row.stripe_checkout_session_id)
          .filter((sessionId): sessionId is string => Boolean(sessionId && !confirmingSessionIdsRef.current.has(sessionId))),
      ),
    );
    if (sessionIds.length === 0) return;

    let cancelled = false;
    sessionIds.forEach((sessionId) => confirmingSessionIdsRef.current.add(sessionId));

    void Promise.allSettled(sessionIds.map((sessionId) => confirmCheckoutSession(sessionId))).then((results) => {
      if (cancelled) return;
      const confirmedCount = results.filter((result) => result.status === "fulfilled").length;
      if (confirmedCount > 0) {
        setCheckoutBanner(
          confirmedCount === 1
            ? "A paid checkout was found and moved into your orders."
            : `${confirmedCount} paid checkouts were found and moved into your orders.`,
        );
        void refresh();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [p2p, pendingBuying, refresh, user]);

  const sellingPending = useMemo(
    () => [
      ...listings.filter((row) => row.status === "reserved"),
      ...sellerTrades.filter((row) => SELLER_PENDING_STATUSES.has(row.status)),
    ],
    [listings, sellerTrades],
  );
  const sellingHistory = useMemo(
    () => sellerTrades.filter((row) => SELLER_HISTORY_STATUSES.has(row.status)),
    [sellerTrades],
  );

  const buyingHistory = useMemo<HistoryItem[]>(() => {
    const items: HistoryItem[] = [
      ...buyerTrades.map((row) => ({
        id: `trade-${row.id}`,
        created_at: row.created_at,
        title: row.product_handle,
        detail: `${row.size_label} - trade`,
        amount: formatMoney(moneyFromCents(buyerTradeTotalCents(row), row.currency)),
        status: prettyStatus(row.status),
        to: `/trade/${row.id}`,
      })),
      ...bids.map((row) => ({
        id: `bid-${row.id}`,
        created_at: row.created_at,
        title: row.product_handle,
        detail: `${row.size_label} - bid`,
        amount: formatMoney(moneyFromCents(row.max_price_cents, row.currency)),
        status: prettyStatus(row.status),
        to: `/product/${row.product_handle}`,
      })),
    ];
    const q = historyQuery.trim().toLowerCase();
    return items
      .filter((item) => !q || `${item.title} ${item.detail} ${item.status}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return historySort === "oldest" ? diff : -diff;
      });
  }, [bids, buyerTrades, historyQuery, historySort]);

  const totalOpenBidCents = bids.filter((row) => row.status === "open").reduce((sum, row) => sum + row.max_price_cents, 0);
  const reservedBuyingCents = pendingBuying.reduce((sum, row) => sum + buyerTradeTotalCents(row), 0);
  const sellerSalesCents = sellerTrades.reduce((sum, row) => sum + (SELLER_SALE_STATUSES.has(row.status) ? row.price_cents : 0), 0);
  const sellerSaleCount = sellerTrades.filter((row) => SELLER_SALE_STATUSES.has(row.status)).length;
  const sellerLevel = Math.floor(sellerSaleCount / SELLER_LEVEL_SALE_STEP) + 1;
  const sellerNextLevelSales = sellerLevel * SELLER_LEVEL_SALE_STEP;
  const sellerSalesToNextLevel = Math.max(sellerNextLevelSales - sellerSaleCount, 0);
  const payoutAvailableCents = sellerTrades.reduce((sum, row) => sum + (row.status === "payout_available" ? sellerNetPayoutCents(row) : 0), 0);
  const sellerLabelCostsCents = sellerTrades.reduce(
    (sum, row) => sum + (SELLER_SALE_STATUSES.has(row.status) ? (row.seller_inbound_label_cents ?? 0) : 0),
    0,
  );
  const sellerFeeCostsCents = sellerTrades.reduce(
    (sum, row) => sum + (SELLER_SALE_STATUSES.has(row.status) ? (row.seller_fee_cents ?? 0) : 0),
    0,
  );
  const sellerNetEstimateCents = sellerTrades.reduce(
    (sum, row) => sum + (SELLER_SALE_STATUSES.has(row.status) ? sellerNetPayoutCents(row) : 0),
    0,
  );

  const productPreview = (handle: string): ProductPreview => ({
    title: productPreviews[handle]?.title ?? handle,
    imageUrl: productPreviews[handle]?.imageUrl ?? null,
  });

  const favoriteItems = favoriteHandles.map((handle) => ({
    handle,
    ...productPreview(handle),
  }));

  const productMini = (handle: string, detail?: string, to?: string) => {
    const preview = productPreview(handle);
    return (
      <span className={styles.productMini}>
        {preview.imageUrl ? (
          <img className={styles.productThumb} src={preview.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className={styles.productThumbPlaceholder} aria-hidden>
            EX
          </span>
        )}
        <span className={styles.productMiniText}>
          <ReturnLink to={to ?? `/product/${handle}`} className={styles.cellLink}>
            {preview.title}
          </ReturnLink>
          {detail ? <small>{detail}</small> : null}
        </span>
      </span>
    );
  };

  if (!p2p) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Account</h1>
        <p className={styles.lead}>
          Add Supabase env vars to sign in. Everyone uses one account type: you shop as a buyer and can list items to sell
          anytime.
        </p>
        <p className={styles.muted}>
          See <code className={styles.code}>.env.example</code> for <code className={styles.code}>VITE_SUPABASE_URL</code> and{" "}
          <code className={styles.code}>VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    );
  }

  if (authLoading) {
    return (
      <p className={styles.muted} role="status">
        Loading…
      </p>
    );
  }

  if (!user) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Your account</h1>
        <p className={styles.lead}>
          You&apos;re a <strong>buyer</strong> by default. After you sign in with email, you can place bids, buy from peers,
          and <strong>list for sale</strong> on any product — no separate seller account.
        </p>
        <p className={styles.muted}>Use the login page to get a magic link.</p>
        <p className={styles.actions}>
          <Link to="/login?next=/account" className={styles.primaryLink}>
            Login
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Account center</p>
          <h1 className={styles.h1}>Your account</h1>
          <p className={styles.lead}>
            Manage your profile, buying, selling, favorites, wallet, and settings from one place.
          </p>
        </div>
        <div className={styles.heroStats} aria-label="Account summary">
          <span>
            <strong>{bids.length}</strong>
            Bids
          </span>
          <span>
            <strong>{listings.length}</strong>
            Listings
          </span>
          <span>
            <strong>Level 1</strong>
            Seller
          </span>
        </div>
      </header>

      <nav className={styles.anchorNav} aria-label="Account sections">
        <a href="#profile">Profile</a>
        <a href="#buying">Buying</a>
        <a href="#selling">Selling</a>
        <a href="#favorites">Favorites</a>
        <a href="#wallet">Wallet</a>
        <a href="#settings">Settings</a>
      </nav>

      {checkoutBanner ? (
        <p className={styles.checkoutBanner} role="status">
          {checkoutBanner}
        </p>
      ) : null}

      {loadError ? (
        <p className={styles.warn} role="alert">
          {loadError}
        </p>
      ) : null}

      <section className={styles.panel} aria-labelledby="personal-heading">
        <div className={`${styles.sectionHead} ${styles.sellingHead}`}>
          <div>
            <p className={styles.kicker}>Profile</p>
            <h2 id="personal-heading" className={styles.h2}>Personal information</h2>
          </div>
          <button type="button" className={styles.btn} disabled={saving} onClick={() => onSaveProfile()}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <input className={styles.input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Username</span>
            <input className={styles.input} value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <input className={styles.input} value={user.email ?? ""} readOnly />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Phone number</span>
            <input className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <input className={styles.input} type="password" value="not-visible" readOnly aria-label="Password hidden" />
          </label>
        </div>
        {saveMsg ? <p className={styles.small}>{saveMsg}</p> : null}
      </section>

      <section className={styles.panel} aria-labelledby="addresses-heading">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>Delivery</p>
            <h2 id="addresses-heading" className={styles.h2}>Shipping addresses</h2>
          </div>
          <button type="button" className={styles.btn} onClick={onAddAddress}>Add address</button>
        </div>
        {addresses.length === 0 ? (
          <p className={styles.empty}>No shipping addresses yet. Add one so checkout can prefill delivery later.</p>
        ) : (
          <div className={styles.addressGrid}>
            {addresses.map((address) => (
              <article key={address.id} className={styles.addressCard}>
                <div className={styles.cardTop}>
                  <strong>{address.label}</strong>
                  {address.isDefault ? <span className={styles.pill}>Default</span> : null}
                </div>
                <p>{address.name || "No recipient"}</p>
                <p>{address.line1 || "Address line missing"}</p>
                {address.line2 ? <p>{address.line2}</p> : null}
                <p>{[address.city, address.region, address.postal].filter(Boolean).join(", ") || "City / state / ZIP"}</p>
                <p>{address.country}</p>
                <button type="button" className={styles.linkBtn} onClick={() => onEditAddress(address)}>Edit</button>
              </article>
            ))}
          </div>
        )}
        {editingAddressId ? (
          <div className={styles.addressEditor}>
            <h3 className={styles.h3}>{editingAddressId === "new" ? "Add address" : "Edit address"}</h3>
            <div className={styles.formGrid}>
              {(["label", "name", "line1", "line2", "city", "region", "postal", "country"] as const).map((key) => (
                <label key={key} className={styles.field}>
                  <span className={styles.label}>{key === "line1" ? "Address line 1" : key === "line2" ? "Address line 2" : key}</span>
                  <input
                    className={styles.input}
                    value={String(addressDraft[key])}
                    onChange={(e) => setAddressDraft((current) => ({ ...current, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={addressDraft.isDefault}
                onChange={(e) => setAddressDraft((current) => ({ ...current, isDefault: e.target.checked }))}
              />
              Make this my default address
            </label>
            <div className={styles.buttonRow}>
              <button type="button" className={styles.btn} onClick={onSaveAddress}>Save address</button>
              <button type="button" className={styles.ghostBtn} onClick={() => setEditingAddressId(null)}>Cancel</button>
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.panel} aria-labelledby="sizes-heading">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>Fit</p>
            <h2 id="sizes-heading" className={styles.h2}>Size preference</h2>
          </div>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.label}>Shoe size</span>
            <select className={styles.input} value={shoeSize} onChange={(e) => setShoeSize(e.target.value)}>
              {["US 6", "US 7", "US 8", "US 9", "US 10", "US 11", "US 12", "US 13"].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Apparel size</span>
            <select className={styles.input} value={apparelSize} onChange={(e) => setApparelSize(e.target.value)}>
              {["XS", "S", "M", "L", "XL", "XXL"].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className={styles.panel} id="buying" aria-labelledby="buying-heading">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>Buying</p>
            <h2 id="buying-heading" className={styles.h2}>Bids, orders, and history</h2>
          </div>
          <Link to="/catalog" className={styles.primaryLink}>Shop catalog</Link>
        </div>
        <div className={styles.metricGrid}>
          <div className={styles.metric}><strong>{bids.length}</strong><span>Bids</span></div>
          <div className={styles.metric}><strong>{orders.length}</strong><span>Orders</span></div>
          <div className={styles.metric}><strong>{pendingBuying.length}</strong><span>Awaiting payment</span></div>
        </div>
        <div className={styles.subSection}>
          <h3 className={styles.h3}>Awaiting payment</h3>
          {pendingBuying.length === 0 ? <p className={styles.empty}>No reserved trades waiting for payment.</p> : (
            <div className={styles.stackList}>
              {pendingBuying.map((row) => (
                <div key={row.id} className={styles.listRow}>
                  {productMini(row.product_handle, `${row.size_label} - ${shortDate(row.created_at)}`, `/trade/${row.id}`)}
                  <span>{formatMoney(moneyFromCents(buyerTradeTotalCents(row), row.currency))}</span>
                  <button
                    type="button"
                    className={styles.payBtn}
                    disabled={busyId === row.id}
                    onClick={() => onResumeCheckout(row.id)}
                  >
                    {busyId === row.id ? "Opening..." : "Resume payment"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.subSection}>
          <h3 className={styles.h3}>Bids</h3>
          {bids.length === 0 ? <p className={styles.empty}>No bids yet.</p> : (
            <div className={styles.tableWrap}><table className={styles.table}><tbody>
              {bids.map((row) => (
                <tr key={row.id}>
                  <td>{productMini(row.product_handle)}</td>
                  <td>{row.size_label}</td>
                  <td>{formatMoney(moneyFromCents(row.max_price_cents, row.currency))}</td>
                  <td><span className={styles.status}>{prettyStatus(row.status)}</span></td>
                  <td>
                    {row.status === "open" ? (
                      <>
                        <button type="button" className={styles.linkBtn} disabled={busyId === row.id} onClick={() => onIncreaseBid(row)}>
                          Increase
                        </button>
                        <button type="button" className={styles.linkBtn} disabled={busyId === row.id} onClick={() => onCancelBid(row.id)}>
                          Cancel
                        </button>
                        <Link to={`/product/${row.product_handle}`} className={styles.linkBtn}>
                          View
                        </Link>
                      </>
                    ) : (
                      <span className={styles.small}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </div>
        <div className={styles.subSection}>
          <h3 className={styles.h3}>Orders</h3>
          {orders.length === 0 ? <p className={styles.empty}>No orders in verification yet.</p> : (
            <div className={styles.stackList}>
              {orders.map((row) => (
                <div key={row.id} className={styles.listRow}>
                  {productMini(row.product_handle, `${row.size_label} - ${shortDate(row.created_at)}`, `/trade/${row.id}`)}
                  <span>{formatMoney(moneyFromCents(buyerTradeTotalCents(row), row.currency))}</span>
                  <span className={styles.status}>{prettyStatus(row.status)}</span>
                  <div className={styles.timelineWrap}>
                    <StatusTimeline row={row} role="buyer" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.subSection}>
          <div className={styles.toolbar}>
            <h3 className={styles.h3}>History</h3>
            <div className={styles.historyTools}>
              <input className={styles.search} placeholder="Search buying history" value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)} />
              <select className={styles.search} value={historySort} onChange={(e) => setHistorySort(e.target.value as "newest" | "oldest")}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
          </div>
          {buyingHistory.length === 0 ? <p className={styles.empty}>No matching history.</p> : (
            <div className={styles.stackList}>
              {buyingHistory.map((item) => (
                <Link key={item.id} to={item.to ?? "#"} className={styles.listRow}>
                  <span className={styles.productMini}>
                    {productPreview(item.title).imageUrl ? (
                      <img className={styles.productThumb} src={productPreview(item.title).imageUrl ?? ""} alt="" loading="lazy" />
                    ) : (
                      <span className={styles.productThumbPlaceholder} aria-hidden>
                        EX
                      </span>
                    )}
                    <span className={styles.productMiniText}>
                      <strong>{productPreview(item.title).title}</strong>
                      <small>{item.detail} - {shortDate(item.created_at)}</small>
                    </span>
                  </span>
                  <span>{item.amount}</span>
                  <span className={styles.status}>{item.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={styles.panel} id="selling" aria-labelledby="selling-heading">
        <div className={`${styles.sectionHead} ${styles.sellingHead}`}>
          <div className={styles.sellingTitleBlock}>
            <div className={styles.sellingTopRow}>
              <p className={styles.kicker}>Selling</p>
              <SellerLevelBadge level={sellerLevel} salesToNext={sellerSalesToNextLevel} />
            </div>
            <h2 id="selling-heading" className={styles.sellingH2} title="Listings, pending, history, and level">
              <span className={styles.sellingHeadingFull}>Listings, pending, history, and level</span>
              <span className={styles.sellingHeadingShort} aria-hidden>
                Listings, pending…
              </span>
            </h2>
          </div>
        </div>
        <div className={styles.metricGrid}>
          <div className={styles.metric}><strong>{listings.length}</strong><span>Listings</span></div>
          <div className={styles.metric}><strong>{sellingPending.length}</strong><span>Pending</span></div>
          <div className={styles.metric}><strong>{sellingHistory.length}</strong><span>History</span></div>
        </div>
        {!stripeAccountId && (listings.length > 0 || sellerTrades.length > 0) ? (
          <div className={styles.payoutGuard}>
            <div>
              <strong>Connect Stripe to receive seller payouts.</strong>
              <p>
                You can keep selling, but EXCH. cannot release payouts until your Stripe Connect account is ready.
              </p>
            </div>
            <button type="button" className={styles.btn} disabled={busyId === "connect"} onClick={onStartSellerOnboarding}>
              {busyId === "connect" ? "Opening..." : "Connect Stripe"}
            </button>
          </div>
        ) : null}
        <div className={styles.subSection}>
          <h3 className={styles.h3}>Listings</h3>
          {listings.length === 0 ? <p className={styles.empty}>No listings yet. Sell from a product page.</p> : (
            <div className={styles.tableWrap}><table className={styles.table}><tbody>
              {listings.map((row) => {
                const draft = listingDrafts[row.id] ?? draftFromListing(row);
                return (
                  <Fragment key={row.id}>
                    <tr>
                      <td>{productMini(row.product_handle)}</td>
                      <td>{row.size_label}</td>
                      <td>{formatMoney(moneyFromCents(row.price_cents, row.currency))}</td>
                      <td><span className={styles.status}>{prettyStatus(row.status)}</span></td>
                      <td>
                        <div className={styles.inlineActions}>
                          {row.status === "active" ? (
                            <>
                              <button type="button" className={styles.linkBtn} onClick={() => onEditListing(row)}>Edit</button>
                              <button
                                type="button"
                                className={styles.linkBtn}
                                disabled={busyId === row.id}
                                onClick={() => onSellListingToBid(row.id)}
                              >
                                Sell to bid
                              </button>
                              <button type="button" className={styles.linkBtn} disabled={busyId === row.id} onClick={() => onCancelListing(row.id)}>
                                Deactivate
                              </button>
                            </>
                          ) : (
                            <span className={styles.small}>Locked after sale starts</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {editingListingId === row.id ? (
                      <tr>
                        <td colSpan={5}>
                          <div className={styles.listingEditor}>
                            <div className={styles.formGrid}>
                              <label className={styles.field}>
                                <span className={styles.label}>Price ({row.currency})</span>
                                <input
                                  className={styles.input}
                                  inputMode="decimal"
                                  value={draft.price}
                                  onChange={(e) => updateListingDraft(row.id, { price: e.target.value })}
                                />
                              </label>
                              <label className={styles.field}>
                                <span className={styles.label}>Condition</span>
                                <select
                                  className={styles.input}
                                  value={draft.condition}
                                  onChange={(e) => updateListingDraft(row.id, { condition: e.target.value as ListingCondition })}
                                >
                                  {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                  ))}
                                </select>
                              </label>
                              <label className={styles.field}>
                                <span className={styles.label}>SKU / style code</span>
                                <input className={styles.input} value={draft.sku} onChange={(e) => updateListingDraft(row.id, { sku: e.target.value })} />
                              </label>
                              <label className={styles.checkRow}>
                                <input
                                  type="checkbox"
                                  checked={draft.boxIncluded}
                                  onChange={(e) => updateListingDraft(row.id, { boxIncluded: e.target.checked })}
                                />
                                Original box included
                              </label>
                            </div>
                            <label className={styles.field}>
                              <span className={styles.label}>Photos</span>
                              <input
                                className={styles.input}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                multiple
                                onChange={(e) => onChooseListingPhotos(row.id, e.target.files)}
                              />
                            </label>
                            <div className={styles.listingPhotoGrid}>
                              {draft.photoUrls.map((url, index) => (
                                <div key={`${row.id}-existing-${url}`} className={styles.listingPhoto}>
                                  <img src={url} alt="" loading="lazy" />
                                  <button
                                    type="button"
                                    onClick={() => updateListingDraft(row.id, { photoUrls: draft.photoUrls.filter((_, i) => i !== index) })}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                              {draft.newPhotos.map((file, index) => (
                                <div key={`${row.id}-new-${file.name}-${index}`} className={styles.listingPhotoQueued}>
                                  <span>{file.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => updateListingDraft(row.id, { newPhotos: draft.newPhotos.filter((_, i) => i !== index) })}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                            <label className={styles.field}>
                              <span className={styles.label}>Defects / wear</span>
                              <textarea
                                className={styles.textarea}
                                value={draft.defects}
                                onChange={(e) => updateListingDraft(row.id, { defects: e.target.value })}
                              />
                            </label>
                            <label className={styles.field}>
                              <span className={styles.label}>Seller notes</span>
                              <textarea
                                className={styles.textarea}
                                value={draft.sellerNotes}
                                onChange={(e) => updateListingDraft(row.id, { sellerNotes: e.target.value })}
                              />
                            </label>
                            <label className={styles.checkRow}>
                              <input
                                type="checkbox"
                                checked={draft.verificationAccepted}
                                onChange={(e) => updateListingDraft(row.id, { verificationAccepted: e.target.checked })}
                              />
                              I confirm these listing details are accurate and can be used by EXCH. during verification.
                            </label>
                            {rowErrors[row.id] ? <p className={styles.warn}>{rowErrors[row.id]}</p> : null}
                            <div className={styles.buttonRow}>
                              <button type="button" className={styles.btn} disabled={busyId === `listing-${row.id}`} onClick={() => onSaveListing(row)}>
                                {busyId === `listing-${row.id}` ? "Saving..." : "Save listing"}
                              </button>
                              <button type="button" className={styles.ghostBtn} onClick={() => setEditingListingId(null)}>Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody></table></div>
          )}
        </div>
        <div className={styles.subSection}>
          <h3 className={styles.h3}>Pending</h3>
          {sellingPending.length === 0 ? <p className={styles.empty}>No pending seller actions.</p> : (
            <div className={styles.stackList}>
              {sellingPending.map((row) => (
                <div key={`${row.id}-${row.status}`} className={styles.listRow}>
                  {productMini(
                    row.product_handle,
                    isTradeRow(row)
                      ? row.seller_tracking_number
                        ? `${sellerActionCopy(row.status)} Tracking: ${row.seller_tracking_number}`
                        : sellerActionCopy(row.status)
                      : "Buyer reserved this listing.",
                    isTradeRow(row) ? `/trade/${row.id}` : undefined,
                  )}
                  <span className={styles.status}>{prettyStatus(row.status)}</span>
                  {isTradeRow(row) && (row.status === "paid" || row.status === "seller_notified") ? (
                    row.seller_label_url ? (
                      <div className={styles.listRowActions}>
                        <a className={styles.payBtn} href={row.seller_label_url} target="_blank" rel="noreferrer">
                          <span className={styles.btnLabelLong}>Open label</span>
                          <span className={styles.btnLabelShort}>Label</span>
                        </a>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          disabled={busyId === `ship-${row.id}`}
                          onClick={() => onMarkSellerShipped(row)}
                        >
                          {busyId === `ship-${row.id}` ? (
                            <>
                              <span className={styles.btnLabelLong}>Saving...</span>
                              <span className={styles.btnLabelShort}>...</span>
                            </>
                          ) : (
                            <>
                              <span className={styles.btnLabelLong}>Mark shipped</span>
                              <span className={styles.btnLabelShort}>Shipped</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className={styles.listRowActions}>
                        <button
                          type="button"
                          className={styles.payBtn}
                          disabled={busyId === `label-${row.id}`}
                          onClick={() => onCreateSellerLabel(row)}
                        >
                          {busyId === `label-${row.id}` ? (
                            <>
                              <span className={styles.btnLabelLong}>Creating...</span>
                              <span className={styles.btnLabelShort}>...</span>
                            </>
                          ) : (
                            <>
                              <span className={styles.btnLabelLong}>Create label</span>
                              <span className={styles.btnLabelShort}>Label</span>
                            </>
                          )}
                        </button>
                      </div>
                    )
                  ) : null}
                  {rowErrors[row.id] ? <p className={styles.warn}>{rowErrors[row.id]}</p> : null}
                  {isTradeRow(row) ? (
                    <div className={styles.timelineWrap}>
                      <StatusTimeline row={row} role="seller" />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.subSection}>
          <h3 className={styles.h3}>Seller history</h3>
          {sellingHistory.length === 0 ? <p className={styles.empty}>No seller history yet.</p> : (
            <div className={styles.stackList}>
              {sellingHistory.map((row) => (
                <div key={row.id} className={styles.listRow}>
                  {productMini(row.product_handle, `${row.size_label} - ${shortDate(row.created_at)}`, `/trade/${row.id}`)}
                  <span>{formatMoney(moneyFromCents(row.price_cents, row.currency))}</span>
                  <span className={styles.status}>{prettyStatus(row.status)}</span>
                  <div className={styles.timelineWrap}>
                    <StatusTimeline row={row} role="seller" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={styles.panel} id="favorites" aria-labelledby="favorites-heading">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>Saved</p>
            <h2 id="favorites-heading" className={styles.h2}>Favorite items</h2>
          </div>
        </div>
        {favoriteItems.length === 0 ? (
          <p className={styles.empty}>No favorites yet. Save products from their product page.</p>
        ) : (
          <div className={showAllFavorites ? `${styles.favoriteGrid} ${styles.favoriteGridExpanded}` : styles.favoriteGrid}>
            {favoriteItems.map((item) => (
              <ReturnLink key={item.handle} to={`/product/${item.handle}`} className={styles.favoriteCard}>
                {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span className={styles.productThumbPlaceholder}>EX</span>}
                <span>{item.title}</span>
                <small>{item.handle}</small>
              </ReturnLink>
            ))}
          </div>
        )}
        {favoriteItems.length > 4 ? (
          <button
            type="button"
            className={styles.seeAllFavorites}
            onClick={() => setShowAllFavorites((current) => !current)}
          >
            {showAllFavorites ? "Show less" : `See all ${favoriteItems.length}`}
          </button>
        ) : null}
      </section>

      <section className={styles.panel} id="wallet" aria-labelledby="wallet-heading">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>Wallet</p>
            <h2 id="wallet-heading" className={styles.h2}>Buying power, sales, and payouts</h2>
          </div>
        </div>
        <div className={styles.walletGrid}>
          <article className={styles.walletCard}>
            <h3 className={styles.h3}>Buying power</h3>
            <p className={styles.bigMoney}>{formatMoney(moneyFromCents(0, "USD"))}</p>
            <p className={styles.small}>Open bid exposure: {formatMoney(moneyFromCents(totalOpenBidCents, "USD"))}</p>
            <p className={styles.small}>Reserved checkout: {formatMoney(moneyFromCents(reservedBuyingCents, "USD"))}</p>
            <button type="button" className={styles.btn}>Add payment method</button>
          </article>
          <article className={styles.walletCard}>
            <h3 className={styles.h3}>Selling</h3>
            <p className={styles.bigMoney}>{formatMoney(moneyFromCents(sellerNetEstimateCents, "USD"))}</p>
            <p className={styles.small}>Estimated net payout</p>
            {!stripeAccountId ? (
              <p className={styles.payoutWarning}>Connect Stripe before payout can be released.</p>
            ) : (
              <p className={styles.payoutReady}>Stripe payout method connected.</p>
            )}
            <p className={styles.small}>Gross sales: {formatMoney(moneyFromCents(sellerSalesCents, "USD"))}</p>
            <p className={styles.small}>Seller inbound labels: -{formatMoney(moneyFromCents(sellerLabelCostsCents, "USD"))}</p>
            <p className={styles.small}>Seller fees: -{formatMoney(moneyFromCents(sellerFeeCostsCents, "USD"))}</p>
            <p className={styles.small}>Payout available: {formatMoney(moneyFromCents(payoutAvailableCents, "USD"))}</p>
            <button type="button" className={styles.btn} disabled={busyId === "connect"} onClick={onStartSellerOnboarding}>
              {stripeAccountId ? "Manage payout method" : "Add payout method"}
            </button>
          </article>
        </div>
      </section>

      <section className={styles.panel} id="settings" aria-labelledby="settings-heading">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>Control center</p>
            <h2 id="settings-heading" className={styles.h2}>Settings</h2>
          </div>
        </div>
        <div className={styles.settingsGrid}>
          {([
            ["orderEmails", "Order updates", "Email me when payments, reservations, or order status changes."],
            ["priceAlerts", "Price alerts", "Notify me when a watched item gets a lower ask."],
            ["sellerAlerts", "Seller alerts", "Notify me about new sales, pending payouts, and listing holds."],
            ["marketing", "Promotions", "Receive product drops and marketplace news."],
            ["twoFactor", "Two-step security", "Require an extra verification step for sensitive account changes."],
            ["privateProfile", "Private seller profile", "Hide public seller stats until you decide to publish them."],
          ] as [SettingKey, string, string][]).map(([key, title, copy]) => (
            <label key={key} className={styles.settingRow}>
              <span><strong>{title}</strong><small>{copy}</small></span>
              <input type="checkbox" checked={settings[key]} onChange={() => toggleSetting(key)} />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
