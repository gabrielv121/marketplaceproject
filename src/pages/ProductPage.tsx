import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/context/AuthContext";
import { fetchMyProfile } from "@/lib/account-data";
import { buildMockOrderBook, buildMockSizeRows } from "@/lib/orderbook-mock";
import { formatMoney } from "@/lib/money-format";
import { parseToCents } from "@/lib/money-parse";
import {
  aggregateBidsToBook,
  aggregateListingsToAsks,
  highestBidForSize,
  insertBid,
  insertListing,
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
import { startCheckoutForTrade, startSellerOnboarding } from "@/lib/checkout";
import { isFavoriteProduct, toggleFavoriteProduct } from "@/lib/favorites";
import { isP2pConfigured } from "@/lib/supabase";
import type { BookEntry, SizeRow } from "@/types/marketplace";
import styles from "./ProductPage.module.css";

type Mode = "buy" | "sell" | "bid";

export function ProductPage() {
  const { handle = "" } = useParams();
  const { user } = useAuth();
  const [product, setProduct] = useState<CatalogProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("buy");
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
          const first = p?.variants.find((v) => v.available) ?? p?.variants[0];
          setSelectedVariantId(first?.id ?? null);
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
      return;
    }
    void fetchMyProfile()
      .then((profile) => {
        if (!cancelled) setStripeAccountId(profile?.stripe_account_id ?? null);
      })
      .catch(() => {
        if (!cancelled) setStripeAccountId(null);
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
  const canUseMockMarket = !product?.tags?.includes("kicksdb");

  const sizeRows: SizeRow[] = useMemo(() => {
    if (!product) return [];
    const mockRows = canUseMockMarket ? buildMockSizeRows(product.handle, currency) : [];
    return product.variants.map((v, i) => {
      const mockRow = mockRows.find((r) => r.label === v.title) ?? mockRows[i % mockRows.length] ?? mockRows[0];
      const low = lowestListingForSize(listings, v.title);
      const high = highestBidForSize(bids, v.title);
      const lastP2p = lastSaleForSize(sales, v.title);
      return {
        id: v.id,
        label: v.title,
        lowestAsk: p2p && low ? moneyFromCents(low.price_cents, low.currency) : canUseMockMarket ? (mockRow?.lowestAsk ?? null) : null,
        highestBid:
          p2p && high ? moneyFromCents(high.max_price_cents, high.currency) : canUseMockMarket ? (mockRow?.highestBid ?? null) : null,
        lastSale: p2p ? lastP2p : canUseMockMarket ? (mockRow?.lastSale ?? null) : null,
      };
    });
  }, [product, currency, listings, bids, sales, p2p, canUseMockMarket]);

  const selectedRow = sizeRows.find((r) => r.id === selectedVariantId) ?? sizeRows[0];
  const lowestAskNum = selectedRow?.lowestAsk ? Number(selectedRow.lowestAsk.amount) : 0;

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
    if (!p2p || listings.length === 0 || sizeRows.length === 0) return;
    const selectedHasAsk = selectedRow ? listings.some((listing) => listing.size_label === selectedRow.label) : false;
    if (selectedHasAsk) return;
    const firstSizeWithAsk = sizeRows.find((row) => listings.some((listing) => listing.size_label === row.label));
    if (firstSizeWithAsk && firstSizeWithAsk.id !== selectedVariantId) {
      setSelectedVariantId(firstSizeWithAsk.id);
    }
  }, [p2p, listings, sizeRows, selectedRow, selectedVariantId]);

  const book = useMemo(() => {
    if (!selectedRow) return { asks: [] as BookEntry[], bids: [] as BookEntry[] };
    if (p2p) {
      return {
        asks: aggregateListingsToAsks(listings, selectedRow.label),
        bids: aggregateBidsToBook(bids, selectedRow.label),
      };
    }
    if (!canUseMockMarket) return { asks: [] as BookEntry[], bids: [] as BookEntry[] };
    if (!lowestAskNum) return { asks: [] as BookEntry[], bids: [] as BookEntry[] };
    return buildMockOrderBook(lowestAskNum, currency);
  }, [p2p, listings, bids, selectedRow, lowestAskNum, currency, canUseMockMarket]);

  const lowestPeerListing =
    p2p && selectedRow ? lowestListingForSize(listings, selectedRow.label) : null;

  const onListForSale = () => {
    if (!product || !selectedRow) return;
    setActionMsg(null);
    const cents = parseToCents(sellPrice);
    if (cents == null) {
      setActionMsg("Enter a valid price.");
      return;
    }
    if (!user) {
      setActionMsg("Sign in to list.");
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
    setActionBusy(true);
    const listingId = crypto.randomUUID();
    void uploadListingPhotos(listingPhotos, listingId)
      .then((photoUrls) =>
        insertListing({
          id: listingId,
          product_handle: product.handle,
          size_label: selectedRow.label,
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
      .then(() => {
        setSellPrice("");
        setListingCondition("new");
        setListingPhotos([]);
        setListingDefects("");
        setListingBoxIncluded(true);
        setListingSku("");
        setListingNotes("");
        setListingVerificationAccepted(false);
        setActionMsg("Listing submitted and live.");
        refreshP2p();
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
    setActionBusy(true);
    void insertBid({
      product_handle: product.handle,
      size_label: selectedRow.label,
      max_price_cents: cents,
      currency,
    })
      .then(() => {
        setBidPrice("");
        setActionMsg("Bid placed.");
        refreshP2p();
      })
      .catch((e: unknown) => setActionMsg(e instanceof Error ? e.message : "Could not bid"))
      .finally(() => setActionBusy(false));
  };

  const onBuyFromPeer = () => {
    if (!lowestPeerListing) return;
    if (!user) {
      setActionMsg("Sign in to buy from a peer.");
      return;
    }
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
          {product.featuredImageUrl ? (
            <img src={product.featuredImageUrl} alt="" className={styles.image} />
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
          <div className={styles.sizes}>
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

          {actionMsg ? (
            <p className={styles.actionMsg} role="status">
              {actionMsg}
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
                  {p2p ? "No peer ask at this size" : "Peer checkout uses Supabase P2P when configured"}
                </button>
              )}
              <p className={styles.hint}>
                Reserves the listing, creates a <code className={styles.code}>reserved</code> trade, then opens{" "}
                <strong>Stripe Checkout</strong> (Edge Function <code className={styles.code}>create-checkout-session</code>
                ). EXCH. holds the buyer payment while the seller ships to us for verification. Seller payout becomes
                available after verification and buyer delivery.
              </p>
            </div>
          )}

          {mode === "sell" && (
            <div className={styles.panel}>
              <div className={styles.formIntro}>
                <p className={styles.sectionLabel}>Listing intake</p>
                <h2 className={styles.formTitle}>Tell us exactly what you are selling</h2>
                <p className={styles.hint}>
                  These details help EXCH. verify the item and reduce buyer disputes after checkout.
                </p>
              </div>
              {user && !stripeAccountId ? (
                <div className={styles.payoutGuard}>
                  <strong>Connect Stripe before payout.</strong>
                  <p>You can list now, but EXCH. cannot release seller payout until Stripe Connect is ready.</p>
                  <button type="button" className={styles.secondary} disabled={connectBusy} onClick={onStartSellerOnboarding}>
                    {connectBusy ? "Opening..." : "Connect Stripe"}
                  </button>
                </div>
              ) : user && stripeAccountId ? (
                <p className={styles.payoutReady}>Stripe payout method connected.</p>
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
                  placeholder="Anything EXCH. should know during verification."
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
                  I understand EXCH. will verify authenticity, condition, size, box/accessories, and may fail or return the item if it does not match this listing.
                </span>
              </label>
              <button type="button" className={styles.secondary} disabled={actionBusy} onClick={() => onListForSale()}>
                {actionBusy ? "Submitting..." : "Submit listing"}
              </button>
              <p className={styles.hint}>
                After a buyer pays, you will create a prepaid label, ship to EXCH., and payout is released only after
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
              <button type="button" className={styles.secondary} disabled={actionBusy} onClick={() => onPlaceBid()}>
                Place bid
              </button>
              <p className={styles.hint}>
                Open bids power the bid side of the book. Matching against asks and payment vaulting are your next layer
                (Stripe auth/capture, or internal ledger).
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
