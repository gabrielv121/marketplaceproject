import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { CatalogProductImage } from "@/components/CatalogProductImage";
import { useAuth } from "@/context/AuthContext";
import { fetchMyBids, fetchMyProfile, type MyBidRow } from "@/lib/account-data";
import { formatMoney } from "@/lib/money-format";
import { parseToCents } from "@/lib/money-parse";
import {
  estimateSellerPayout,
  sellerFeePercentLabel,
} from "@/lib/seller-payout-estimate";
import {
  aggregateBidsToBook,
  aggregateListingsToAsks,
  highestBidForSize,
  insertListing,
  rpcCancelBid,
  rpcPlaceBid,
  rpcUpdateBid,
  rpcSellListingToBid,
  lastSaleForSize,
  lowestListingForSize,
  moneyFromCents,
  rpcListActiveListings,
  rpcListOpenBids,
  rpcListRecentSales,
  rpcTakeListing,
  uploadListingPhotos,
  type ActiveListingRow,
  type ListingCondition,
  type OpenBidRow,
  type RecentSaleRow,
} from "@/lib/p2p";
import { resolveProductDetailByHandle } from "@/lib/catalog-supabase";
import type { CatalogProductDetail } from "@/lib/catalog-product";
import { recordProductView } from "@/lib/recently-viewed";
import { notifyBidMatch, startCheckoutForTrade, startSellerOnboarding } from "@/lib/checkout";
import { isFavoriteProduct, toggleFavoriteProduct } from "@/lib/favorites";
import { resolveFeaturedImageUrl } from "@/lib/catalog-images";
import {
  EMAIL_VERIFY_REQUIRED_MESSAGE,
  fetchEmailVerified,
  requestWelcomeOrVerifyEmail,
} from "@/lib/email-verification";
import { isShoeProduct } from "@/lib/product-sizes";
import {
  buildShoeSizeRows,
  conversionLineForSizeRow,
  defaultShoeGenderFromProduct,
  findShoeSizeById,
  parsePreferredShoeUsSize,
  shoeSizeLabelForBook,
  shoeSizesForGender,
  type ShoeGender,
  type ShoeSizeSystem,
} from "@/lib/shoe-sizes";
import { sizeLabelsMatch } from "@/lib/size-labels";
import { isP2pConfigured } from "@/lib/supabase";
import type { BookEntry, SizeRow } from "@/types/marketplace";
import styles from "./ProductPage.module.css";

type Mode = "buy" | "sell" | "bid";

const DEFAULT_SHOE_US = 10;

export function ProductPage() {
  const { handle = "" } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const [product, setProduct] = useState<CatalogProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    return tab === "sell" || tab === "bid" || tab === "buy" ? tab : "buy";
  });
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [listingCondition, setListingCondition] = useState<ListingCondition>("new");
  const [listingPhotos, setListingPhotos] = useState<File[]>([]);
  const [listingDefects, setListingDefects] = useState("");
  const [listingBoxIncluded, setListingBoxIncluded] = useState(true);
  const [listingSku, setListingSku] = useState("");
  const [listingNotes, setListingNotes] = useState("");
  const [listingVerificationAccepted, setListingVerificationAccepted] = useState(false);
  const [bidPrice, setBidPrice] = useState("");
  const [listings, setListings] = useState<ActiveListingRow[]>([]);
  const [bids, setBids] = useState<OpenBidRow[]>([]);
  const [sales, setSales] = useState<RecentSaleRow[]>([]);
  const [p2pLoadError, setP2pLoadError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [p2pTick, setP2pTick] = useState(0);
  const [myBids, setMyBids] = useState<MyBidRow[]>([]);
  const [shoeGender, setShoeGender] = useState<ShoeGender>("men");
  const [sizeSystem, setSizeSystem] = useState<ShoeSizeSystem>("us");
  const [preferredShoeUs, setPreferredShoeUs] = useState<number | null>(null);
  const [emailVerified, setEmailVerified] = useState(true);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const authReturnPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    if (mode === "sell") params.set("tab", "sell");
    else params.delete("tab");
    const q = params.toString();
    return `${location.pathname}${q ? `?${q}` : ""}`;
  }, [location.pathname, location.search, mode]);
  const authNextQuery = `next=${encodeURIComponent(authReturnPath)}`;

  const refreshP2p = useCallback(() => {
    setP2pTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const p = await resolveProductDetailByHandle(handle);
        if (!cancelled) {
          setProduct(p);
        }
      } catch {
        if (!cancelled) {
          setProduct(null);
          setSelectedVariantId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  useEffect(() => {
    if (!product || loading) return;
    recordProductView(user?.id, {
      handle: product.handle,
      title: product.title,
      featuredImageUrl: product.featuredImageUrl,
    });
  }, [product, loading, user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!user || !product || !isP2pConfigured()) {
      setFavorite(false);
      return;
    }
    void isFavoriteProduct(product.handle)
      .then((saved) => {
        if (!cancelled) setFavorite(saved);
      })
      .catch(() => {
        if (!cancelled) setFavorite(false);
      });
    return () => {
      cancelled = true;
    };
  }, [product, user]);

  useEffect(() => {
    let cancelled = false;
    if (!user || !isP2pConfigured()) {
      setStripeAccountId(null);
      setPreferredShoeUs(null);
      return;
    }
    void fetchMyProfile()
      .then((profile) => {
        if (cancelled) return;
        setStripeAccountId(profile?.stripe_account_id ?? null);
        setPreferredShoeUs(parsePreferredShoeUsSize(profile?.preferred_shoe_size));
      })
      .catch(() => {
        if (!cancelled) {
          setStripeAccountId(null);
          setPreferredShoeUs(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!isP2pConfigured() || !handle) return;
    let cancelled = false;
    (async () => {
      setP2pLoadError(null);
      try {
        const [L, B, S] = await Promise.all([
          rpcListActiveListings(handle),
          rpcListOpenBids(handle),
          rpcListRecentSales(handle),
        ]);
        if (!cancelled) {
          setListings(L);
          setBids(B);
          setSales(S);
        }
      } catch (e) {
        if (!cancelled) setP2pLoadError(e instanceof Error ? e.message : "P2P load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle, p2pTick]);

  const currency = product?.priceRange.currency ?? "USD";
  const p2p = isP2pConfigured();

  useEffect(() => {
    if (!user || !p2p) {
      setMyBids([]);
      return;
    }
    let cancelled = false;
    void fetchMyBids()
      .then((rows) => {
        if (!cancelled) setMyBids(rows);
      })
      .catch(() => {
        if (!cancelled) setMyBids([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, p2p, p2pTick]);

  const shoeProduct = product ? isShoeProduct(product) : false;

  const preferredUs = preferredShoeUs ?? DEFAULT_SHOE_US;

  useEffect(() => {
    if (!product) return;
    if (shoeProduct) {
      const gender = defaultShoeGenderFromProduct(product.gender, product.departmentSlug);
      setShoeGender(gender);
      const pool = shoeSizesForGender(gender);
      const pick = pool.find((s) => s.us === preferredUs) ?? pool.find((s) => s.us === DEFAULT_SHOE_US) ?? pool[0];
      setSelectedVariantId(pick?.id ?? null);
      return;
    }
    const first = product.variants.find((v) => v.available) ?? product.variants[0];
    setSelectedVariantId(first?.id ?? null);
  }, [product?.handle, shoeProduct, preferredUs]);

  useEffect(() => {
    if (!product || !shoeProduct) return;
    setSelectedVariantId((prev) => {
      const current = findShoeSizeById(prev ?? "");
      const pool = shoeSizesForGender(shoeGender);
      const targetUs = current?.us ?? preferredUs;
      const match =
        pool.find((s) => s.us === targetUs) ??
        pool.find((s) => s.us === preferredUs) ??
        pool.find((s) => s.us === DEFAULT_SHOE_US) ??
        pool[0];
      return match?.id ?? prev;
    });
  }, [shoeGender, product?.handle, shoeProduct, preferredUs]);

  const sizeRows: SizeRow[] = useMemo(() => {
    if (!product) return [];
    if (shoeProduct) {
      return buildShoeSizeRows({
        gender: shoeGender,
        system: sizeSystem,
        listings,
        bids,
        sales,
        p2p,
      });
    }
    return product.variants.map((v) => {
      const low = lowestListingForSize(listings, v.title);
      const high = highestBidForSize(bids, v.title);
      const lastP2p = lastSaleForSize(sales, v.title);
      return {
        id: v.id,
        label: v.title,
        lowestAsk: p2p && low ? moneyFromCents(low.price_cents, low.currency) : null,
        highestBid: p2p && high ? moneyFromCents(high.max_price_cents, high.currency) : null,
        lastSale: p2p ? lastP2p : null,
      };
    });
  }, [product, shoeProduct, shoeGender, sizeSystem, listings, bids, sales, p2p]);

  const selectedRow = sizeRows.find((r) => r.id === selectedVariantId) ?? sizeRows[0];
  const activeSizeLabel = selectedRow ? shoeSizeLabelForBook(selectedRow) : "";
  const selectedConversionLine = selectedRow ? conversionLineForSizeRow(selectedRow) : null;

  const sellPayoutEstimate = useMemo(() => {
    const cents = parseToCents(sellPrice);
    if (cents == null) return null;
    return estimateSellerPayout(cents, currency);
  }, [sellPrice, currency]);

  const photoPreviews = useMemo(
    () => listingPhotos.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    [listingPhotos],
  );

  useEffect(() => {
    return () => {
      photoPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [photoPreviews]);

  useEffect(() => {
    // Buy mode: jump to a size that has an ask if preferred size has none.
    // Sell/bid keep the preferred size so listing/bidding stays on the user's size.
    if (mode !== "buy") return;
    if (!p2p || listings.length === 0 || sizeRows.length === 0) return;
    const selectedHasAsk = selectedRow
      ? listings.some((listing) => sizeLabelsMatch(listing.size_label, activeSizeLabel))
      : false;
    if (selectedHasAsk) return;
    const firstSizeWithAsk = sizeRows.find((row) =>
      listings.some((listing) => sizeLabelsMatch(listing.size_label, shoeSizeLabelForBook(row))),
    );
    if (firstSizeWithAsk && firstSizeWithAsk.id !== selectedVariantId) {
      setSelectedVariantId(firstSizeWithAsk.id);
    }
  }, [mode, p2p, listings, sizeRows, selectedRow, selectedVariantId, activeSizeLabel]);

  const book = useMemo(() => {
    if (!selectedRow || !p2p) return { asks: [] as BookEntry[], bids: [] as BookEntry[] };
    return {
      asks: aggregateListingsToAsks(listings, activeSizeLabel),
      bids: aggregateBidsToBook(bids, activeSizeLabel),
    };
  }, [p2p, listings, bids, selectedRow, activeSizeLabel]);

  const lowestPeerListing = p2p && selectedRow ? lowestListingForSize(listings, activeSizeLabel) : null;

  const myOpenBidAtSize = useMemo(() => {
    if (!product || !selectedRow) return null;
    return (
      myBids.find(
        (b) =>
          b.status === "open" &&
          b.product_handle === product.handle &&
          sizeLabelsMatch(b.size_label, activeSizeLabel),
      ) ?? null
    );
  }, [myBids, product, selectedRow, activeSizeLabel]);

  const highestOpenBidAtSize = selectedRow ? highestBidForSize(bids, activeSizeLabel) : null;

  useEffect(() => {
    if (!user || !p2p) {
      setEmailVerified(true);
      return;
    }
    let cancelled = false;
    void fetchEmailVerified()
      .then((ok) => {
        if (!cancelled) setEmailVerified(ok);
      })
      .catch(() => {
        if (!cancelled) setEmailVerified(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, p2p, p2pTick]);

  const requireVerifiedEmail = (): boolean => {
    if (emailVerified) return true;
    setActionMsg(EMAIL_VERIFY_REQUIRED_MESSAGE);
    return false;
  };

  const onResendVerifyEmail = () => {
    setVerifyBusy(true);
    setActionMsg(null);
    void requestWelcomeOrVerifyEmail({ reason: "reminder" })
      .then((result) => {
        if (result.alreadyVerified) {
          setEmailVerified(true);
          setActionMsg("Your email is already verified.");
          return;
        }
        setActionMsg(result.sent ? "Verification email sent. Check your inbox (and spam)." : "Could not send email.");
      })
      .catch((e: unknown) => setActionMsg(e instanceof Error ? e.message : "Could not send verification email"))
      .finally(() => setVerifyBusy(false));
  };

  const onListForSale = () => {
    if (!product || !selectedRow) return;
    setActionMsg(null);
    const cents = parseToCents(sellPrice);
    if (cents == null) {
      setActionMsg("Enter a valid price.");
      return;
    }
    if (listingPhotos.length === 0) {
      setActionMsg("Add at least one listing photo for verification.");
      return;
    }
    if ((listingCondition === "new_with_defects" || listingCondition === "fair") && !listingDefects.trim()) {
      setActionMsg("Describe defects or wear for this condition.");
      return;
    }
    if (!listingVerificationAccepted) {
      setActionMsg("Accept the verification requirements before listing.");
      return;
    }
    if (!user) {
      setActionMsg(
        "Sign in or create an account to publish this listing. Use the buttons above — you will return to the Sell tab.",
      );
      return;
    }
    if (!requireVerifiedEmail()) return;
    setActionBusy(true);
    const listingId = crypto.randomUUID();
    void uploadListingPhotos(listingPhotos, listingId)
      .then((photoUrls) =>
        insertListing({
          id: listingId,
          product_handle: product.handle,
          size_label: activeSizeLabel,
          catalog_variant_id: selectedVariantId ?? null,
          price_cents: cents,
          currency,
          condition: listingCondition,
          photo_urls: photoUrls,
          defects: listingDefects,
          box_included: listingBoxIncluded,
          sku: listingSku,
          seller_notes: listingNotes,
          verification_requirements_accepted_at: new Date().toISOString(),
        }),
      )
      .then(async (createdListingId) => {
        setSellPrice("");
        setListingCondition("new");
        setListingPhotos([]);
        setListingDefects("");
        setListingBoxIncluded(true);
        setListingSku("");
        setListingNotes("");
        setListingVerificationAccepted(false);
        refreshP2p();
        try {
          const tradeId = await rpcSellListingToBid(createdListingId);
          void notifyBidMatch(tradeId, window.location.origin);
          setActionMsg("Listing matched to highest open bid. The buyer can complete checkout from their account.");
          return;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "";
          if (!msg.includes("No open bid")) throw e;
        }
        setActionMsg("Listing submitted and live.");
      })
      .catch((e: unknown) => setActionMsg(e instanceof Error ? e.message : "Could not list"))
      .finally(() => setActionBusy(false));
  };

  const onChooseListingPhotos = (files: FileList | null) => {
    if (!files) return;
    const next = [...listingPhotos, ...Array.from(files)].slice(0, 6);
    setListingPhotos(next);
  };

  const onRemoveListingPhoto = (index: number) => {
    setListingPhotos((current) => current.filter((_, i) => i !== index));
  };

  const onStartSellerOnboarding = () => {
    if (!user) {
      setActionMsg("Sign in to connect Stripe for payouts.");
      return;
    }
    setConnectBusy(true);
    setActionMsg(null);
    void startSellerOnboarding(window.location.origin)
      .then((url) => window.location.assign(url))
      .catch((e: unknown) => setActionMsg(e instanceof Error ? e.message : "Could not start Stripe onboarding"))
      .finally(() => setConnectBusy(false));
  };

  const finishBidAction = async (
    result: Awaited<ReturnType<typeof rpcPlaceBid>>,
    successMsg = "Bid saved. You will match automatically when a seller asks at or below your max.",
  ) => {
    setBidPrice("");
    refreshP2p();
    if (result.matched && result.tradeId) {
      setActionMsg("Bid matched the lowest ask — opening checkout…");
      void notifyBidMatch(result.tradeId, window.location.origin);
      const url = await startCheckoutForTrade(result.tradeId, window.location.origin);
      window.location.assign(url);
      return;
    }
    setActionMsg(successMsg);
  };

  const onPlaceBid = () => {
    if (!product || !selectedRow) return;
    setActionMsg(null);
    const cents = parseToCents(bidPrice);
    if (cents == null) {
      setActionMsg("Enter a valid bid.");
      return;
    }
    if (!user) {
      setActionMsg("Sign in to bid.");
      return;
    }
    if (!requireVerifiedEmail()) return;
    setActionBusy(true);
    void rpcPlaceBid({
      product_handle: product.handle,
      size_label: activeSizeLabel,
      max_price_cents: cents,
      currency,
    })
      .then(async (result) => {
        if (result.matched && result.tradeId) {
          await finishBidAction(result);
          return;
        }
        setBidPrice("");
        refreshP2p();
        setActionMsg("Bid placed. You will match automatically when a seller asks at or below your max.");
      })
      .catch((e: unknown) => setActionMsg(e instanceof Error ? e.message : "Could not bid"))
      .finally(() => setActionBusy(false));
  };

  const onUpdateMyBid = () => {
    if (!myOpenBidAtSize) return;
    setActionMsg(null);
    if (!requireVerifiedEmail()) return;
    const cents = parseToCents(bidPrice);
    if (cents == null) {
      setActionMsg("Enter a valid bid.");
      return;
    }
    if (cents <= myOpenBidAtSize.max_price_cents) {
      setActionMsg(`Enter more than your current max (${formatMoney(moneyFromCents(myOpenBidAtSize.max_price_cents, currency))}).`);
      return;
    }
    setActionBusy(true);
    void rpcUpdateBid(myOpenBidAtSize.id, cents)
      .then((result) => finishBidAction(result, "Bid increased. You will match when a seller asks at or below your new max."))
      .catch((e: unknown) => setActionMsg(e instanceof Error ? e.message : "Could not update bid"))
      .finally(() => setActionBusy(false));
  };

  const onCancelMyBid = () => {
    if (!myOpenBidAtSize) return;
    setActionMsg(null);
    setActionBusy(true);
    void rpcCancelBid(myOpenBidAtSize.id)
      .then(() => {
        setActionMsg("Bid cancelled.");
        refreshP2p();
      })
      .catch((e: unknown) => setActionMsg(e instanceof Error ? e.message : "Could not cancel bid"))
      .finally(() => setActionBusy(false));
  };

  const onBuyFromPeer = () => {
    if (!lowestPeerListing) return;
    if (!user) {
      setActionMsg("Sign in to buy from a peer.");
      return;
    }
    if (!requireVerifiedEmail()) return;
    setActionMsg(null);
    setActionBusy(true);
    void rpcTakeListing(lowestPeerListing.id)
      .then(async (tradeId) => {
        const url = await startCheckoutForTrade(tradeId, window.location.origin);
        window.location.assign(url);
      })
      .catch((e: unknown) => setActionMsg(e instanceof Error ? e.message : "Could not start checkout"))
      .finally(() => setActionBusy(false));
  };

  const onToggleFavorite = () => {
    if (!product) return;
    if (!user) {
      setActionMsg("Sign in to save favorites.");
      return;
    }
    setFavoriteBusy(true);
    setActionMsg(null);
    const next = !favorite;
    void toggleFavoriteProduct(product.handle, next)
      .then(() => {
        setFavorite(next);
        setActionMsg(next ? "Saved to favorites." : "Removed from favorites.");
      })
      .catch((e: unknown) => setActionMsg(e instanceof Error ? e.message : "Could not update favorite"))
      .finally(() => setFavoriteBusy(false));
  };

  if (loading) {
    return <p className={styles.muted}>Loading…</p>;
  }

  if (!product) {
    return (
      <div>
        <p>Product not found.</p>
        <BackButton fallback="/catalog" className={styles.back}>
          Back
        </BackButton>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <BackButton fallback="/catalog" className={styles.back}>
          ← Back
        </BackButton>
        <button
          type="button"
          className={favorite ? `${styles.favoriteBtn} ${styles.favoriteBtnOn}` : styles.favoriteBtn}
          disabled={favoriteBusy}
          onClick={onToggleFavorite}
          aria-pressed={favorite}
        >
          {favorite ? "Saved" : "Save"}
        </button>
      </div>
      {p2pLoadError ? (
        <p className={styles.warn} role="status">
          P2P: {p2pLoadError}
        </p>
      ) : null}
      <div className={styles.grid}>
        <div className={styles.media}>
          {resolveFeaturedImageUrl(product) ? (
            <CatalogProductImage product={product} alt="" className={styles.image} />
          ) : (
            <div className={styles.ph} />
          )}
        </div>
        <div>
          <h1 className={styles.title}>{product.title}</h1>
          {selectedRow?.lastSale ? (
            <p className={styles.lastSale}>
              Last sale: <strong>{formatMoney(selectedRow.lastSale)}</strong>
            </p>
          ) : null}

          <div className={styles.tabs} role="tablist" aria-label="Trade mode">
            {(["buy", "sell", "bid"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? styles.tabOn : styles.tab}
                onClick={() => setMode(m)}
              >
                {m === "buy" ? "Buy" : m === "sell" ? "Sell" : "Bid"}
              </button>
            ))}
          </div>

          <p className={styles.sectionLabel}>Size</p>
          {shoeProduct ? (
            <div className={styles.sizeToolbar}>
              <div className={styles.sizeToggleGroup} role="group" aria-label="Size gender">
                {(["men", "women"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={shoeGender === g ? styles.sizeToggleOn : styles.sizeToggle}
                    aria-pressed={shoeGender === g}
                    aria-label={g === "men" ? "US men's sizes" : "US women's sizes"}
                    onClick={() => setShoeGender(g)}
                  >
                    {g === "men" ? "US M" : "US W"}
                  </button>
                ))}
              </div>
              <div className={`${styles.sizeToggleGroup} ${styles.sizeToggleGroupScroll}`} role="group" aria-label="Size format">
                {(
                  [
                    ["us", "US"],
                    ["eu", "EU"],
                    ["uk", "UK"],
                    ["cm", "CM"],
                    ["kr", "KR"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={sizeSystem === key ? styles.sizeToggleOn : styles.sizeToggle}
                    aria-pressed={sizeSystem === key}
                    onClick={() => setSizeSystem(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className={shoeProduct ? `${styles.sizes} ${styles.sizesScroll}` : styles.sizes}>
            {sizeRows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={row.id === selectedVariantId ? styles.sizeOn : styles.size}
                onClick={() => setSelectedVariantId(row.id)}
              >
                <span className={styles.sizeLabel}>{row.label}</span>
                {row.lowestAsk ? (
                  <span className={styles.sizeAsk}>{formatMoney(row.lowestAsk)}</span>
                ) : (
                  <span className={styles.sizeAsk}>—</span>
                )}
              </button>
            ))}
          </div>
          {selectedConversionLine ? (
            <p className={styles.sizeConversion} aria-live="polite">
              {selectedConversionLine}
            </p>
          ) : null}

          {actionMsg ? (
            <p className={styles.actionMsg} role="status">
              {actionMsg}
            </p>
          ) : null}
          {user && !emailVerified ? (
            <p className={styles.hint}>
              Verify your email to buy, bid, or list.{" "}
              <button type="button" className={styles.textBtn} disabled={verifyBusy} onClick={onResendVerifyEmail}>
                {verifyBusy ? "Sending…" : "Resend verification email"}
              </button>
            </p>
          ) : null}

          {mode === "buy" && (
            <div className={styles.panel}>
              <div className={styles.row}>
                <span className={styles.k}>Lowest ask</span>
                <span className={styles.v}>
                  {selectedRow?.lowestAsk ? formatMoney(selectedRow.lowestAsk) : "—"}
                </span>
              </div>
              {p2p && lowestPeerListing ? (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={actionBusy}
                  onClick={() => onBuyFromPeer()}
                >
                  Buy from peer (P2P)
                </button>
              ) : (
                <button type="button" className={`${styles.primary} ${styles.btnDisabled}`} disabled>
                  {p2p ? "No peer ask at this size" : "Sign in to buy or sell from the live order book"}
                </button>
              )}
              <p className={styles.hint}>
                Reserves the listing, then opens <strong>Stripe Checkout</strong> with item price, a 3% processing fee,
                and verified delivery shipping. VRNA holds payment while the seller ships to us for verification.
              </p>
            </div>
          )}

          {mode === "sell" && (
            <div className={styles.panel}>
              <div className={styles.formIntro}>
                <p className={styles.sectionLabel}>Listing intake</p>
                <h2 className={styles.formTitle}>Tell us exactly what you are selling</h2>
                <p className={styles.hint}>
                  These details help VRNA verify the item and reduce buyer disputes after checkout.
                </p>
              </div>
              {user && !stripeAccountId ? (
                <div className={styles.payoutGuard}>
                  <strong>Connect Stripe before payout.</strong>
                  <p>You can list now, but VRNA cannot release seller payout until Stripe Connect is ready.</p>
                  <button type="button" className={styles.secondary} disabled={connectBusy} onClick={onStartSellerOnboarding}>
                    {connectBusy ? "Opening..." : "Connect Stripe"}
                  </button>
                </div>
              ) : user && stripeAccountId ? (
                <p className={styles.payoutReady}>Stripe payout method connected.</p>
              ) : null}
              {highestOpenBidAtSize ? (
                <p className={styles.hint}>
                  Highest bid for this size: {formatMoney(moneyFromCents(highestOpenBidAtSize.max_price_cents, currency))}.
                  List at or below that price to match instantly (buyer completes checkout).
                </p>
              ) : null}
              <div className={styles.sellFormGrid}>
                <label className={styles.field}>
                  <span className={styles.k}>Your ask ({currency})</span>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    placeholder={selectedRow?.lowestAsk?.amount ?? "0"}
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.k}>Condition</span>
                  <select
                    className={styles.input}
                    value={listingCondition}
                    onChange={(e) => setListingCondition(e.target.value as ListingCondition)}
                  >
                    <option value="new">New / unworn</option>
                    <option value="new_with_defects">New with defects</option>
                    <option value="excellent">Excellent</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.k}>SKU / style code</span>
                  <input
                    className={styles.input}
                    placeholder="Optional, e.g. DZ5485-612"
                    value={listingSku}
                    onChange={(e) => setListingSku(e.target.value)}
                  />
                </label>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={listingBoxIncluded}
                    onChange={(e) => setListingBoxIncluded(e.target.checked)}
                  />
                  Original box included
                </label>
              </div>
              {sellPayoutEstimate ? (
                <div className={styles.payoutEstimate} aria-live="polite">
                  <p className={styles.payoutEstimateTitle}>Estimated payout if this sells</p>
                  <dl className={styles.payoutEstimateRows}>
                    <div className={styles.payoutEstimateRow}>
                      <dt>Your ask</dt>
                      <dd>{formatMoney(sellPayoutEstimate.ask)}</dd>
                    </div>
                    <div className={styles.payoutEstimateRow}>
                      <dt>VRNA fee ({sellerFeePercentLabel(sellPayoutEstimate.feeBps)})</dt>
                      <dd>−{formatMoney(sellPayoutEstimate.fee)}</dd>
                    </div>
                    <div className={styles.payoutEstimateRow}>
                      <dt>Prepaid ship to VRNA (est.)</dt>
                      <dd>−{formatMoney(sellPayoutEstimate.inboundLabel)}</dd>
                    </div>
                    <div className={`${styles.payoutEstimateRow} ${styles.payoutEstimateNet}`}>
                      <dt>Est. net payout</dt>
                      <dd>{formatMoney(sellPayoutEstimate.net)}</dd>
                    </div>
                  </dl>
                  <p className={styles.payoutEstimateNote}>
                    Final payout uses the real prepaid label cost when you ship. Buyers pay item price, processing
                    fee, and delivery shipping on top of your ask.
                  </p>
                </div>
              ) : null}
              <label className={styles.field}>
                <span className={styles.k}>Photos</span>
                <input
                  className={styles.fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(e) => onChooseListingPhotos(e.target.files)}
                />
                <small className={styles.fieldHelp}>Upload up to 6 photos. Include all angles, soles/tags, and any flaws.</small>
              </label>
              {photoPreviews.length > 0 ? (
                <div className={styles.photoGrid}>
                  {photoPreviews.map((preview, index) => (
                    <div key={`${preview.name}-${preview.url}`} className={styles.photoPreview}>
                      <img src={preview.url} alt="" />
                      <button type="button" onClick={() => onRemoveListingPhoto(index)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <label className={styles.field}>
                <span className={styles.k}>Defects / wear</span>
                <textarea
                  className={styles.textarea}
                  placeholder="Mention stains, scuffs, missing accessories, odors, replaced laces, etc."
                  value={listingDefects}
                  onChange={(e) => setListingDefects(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.k}>Seller notes</span>
                <textarea
                  className={styles.textarea}
                  placeholder="Anything VRNA should know during verification."
                  value={listingNotes}
                  onChange={(e) => setListingNotes(e.target.value)}
                />
              </label>
              <label className={`${styles.checkRow} ${styles.verifyBox}`}>
                <input
                  type="checkbox"
                  checked={listingVerificationAccepted}
                  onChange={(e) => setListingVerificationAccepted(e.target.checked)}
                />
                <span>
                  I understand VRNA will verify authenticity, condition, size, box/accessories, and may fail or return the item if it does not match this listing.
                </span>
              </label>
              {!user ? (
                <div className={styles.payoutGuard} role="status">
                  <strong>Sign in required to publish</strong>
                  <p>
                    Choose your size, add photos, and fill in the details now. You only need to sign in (or create an
                    account) when you are ready to publish the listing.
                  </p>
                  <div className={styles.guestAuthActions}>
                    <Link to={`/login?${authNextQuery}`} className={styles.primary}>
                      Sign in to list
                    </Link>
                    <Link to={`/signup?${authNextQuery}`} className={styles.ghostAuthLink}>
                      Create account
                    </Link>
                  </div>
                </div>
              ) : null}
              <button type="button" className={styles.secondary} disabled={actionBusy} onClick={() => onListForSale()}>
                {actionBusy ? "Submitting..." : user ? "Submit listing" : "Review & continue"}
              </button>
              <p className={styles.hint}>
                After a buyer pays, you will create a prepaid label, ship to VRNA, and payout is released only after
                verification and buyer delivery.
              </p>
            </div>
          )}

          {mode === "bid" && (
            <div className={styles.panel}>
              <div className={styles.row}>
                <span className={styles.k}>Highest bid</span>
                <span className={styles.v}>
                  {selectedRow?.highestBid ? formatMoney(selectedRow.highestBid) : "—"}
                </span>
              </div>
              {lowestPeerListing && highestOpenBidAtSize && highestOpenBidAtSize.max_price_cents >= lowestPeerListing.price_cents ? (
                <p className={styles.hint}>
                  Lowest ask {formatMoney(moneyFromCents(lowestPeerListing.price_cents, currency))} — a bid at or above
                  that price can match instantly and open Stripe Checkout.
                </p>
              ) : null}
              {myOpenBidAtSize ? (
                <div className={styles.row}>
                  <span className={styles.k}>Your open bid</span>
                  <span className={styles.v}>{formatMoney(moneyFromCents(myOpenBidAtSize.max_price_cents, currency))}</span>
                </div>
              ) : (
                <label className={styles.field}>
                  <span className={styles.k}>Your max bid ({currency})</span>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    placeholder={selectedRow?.highestBid?.amount ?? "0"}
                    value={bidPrice}
                    onChange={(e) => setBidPrice(e.target.value)}
                  />
                </label>
              )}
              {myOpenBidAtSize ? (
                <>
                  <label className={styles.field}>
                    <span className={styles.k}>Increase max bid ({currency})</span>
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      placeholder={String(Math.ceil(myOpenBidAtSize.max_price_cents / 100) + 1)}
                      value={bidPrice}
                      onChange={(e) => setBidPrice(e.target.value)}
                    />
                  </label>
                  <div className={styles.row}>
                    <button type="button" className={styles.secondary} disabled={actionBusy} onClick={() => onUpdateMyBid()}>
                      {actionBusy ? "Updating..." : "Increase bid"}
                    </button>
                    <button type="button" className={styles.secondary} disabled={actionBusy} onClick={() => onCancelMyBid()}>
                      Cancel bid
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" className={styles.secondary} disabled={actionBusy} onClick={() => onPlaceBid()}>
                  {actionBusy ? "Placing..." : "Place bid"}
                </button>
              )}
              <p className={styles.hint}>
                Bids auto-match the lowest ask at or below your max. Sellers can also accept your bid from their listing.
                Payment uses the same Stripe Checkout flow as Buy.
              </p>
            </div>
          )}

          <div className={styles.depth}>
            <div>
              <h2 className={styles.depthTitle}>Asks</h2>
              <ul className={styles.depthList}>
                {book.asks.length ? (
                  book.asks.map((a) => (
                    <li key={a.id} className={styles.depthRow}>
                      <span>{formatMoney(a.price)}</span>
                      <span className={styles.qty}>{a.qty}</span>
                    </li>
                  ))
                ) : (
                  <li className={styles.depthEmpty}>No asks</li>
                )}
              </ul>
            </div>
            <div>
              <h2 className={styles.depthTitle}>Bids</h2>
              <ul className={styles.depthList}>
                {book.bids.length ? (
                  book.bids.map((b) => (
                    <li key={b.id} className={styles.depthRow}>
                      <span>{formatMoney(b.price)}</span>
                      <span className={styles.qty}>{b.qty}</span>
                    </li>
                  ))
                ) : (
                  <li className={styles.depthEmpty}>No bids</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
