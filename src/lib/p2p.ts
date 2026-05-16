import type { BookEntry, Money } from "@/types/marketplace";
import { getSupabase } from "./supabase";

export type ActiveListingRow = {
  id: string;
  created_at: string;
  size_label: string;
  catalog_variant_id: string | null;
  price_cents: number;
  currency: string;
};

export type OpenBidRow = {
  id: string;
  created_at: string;
  size_label: string;
  max_price_cents: number;
  currency: string;
};

export type RecentSaleRow = {
  size_label: string;
  price_cents: number;
  currency: string;
  sold_at: string;
};

export type ListingCondition = "new" | "new_with_defects" | "excellent" | "good" | "fair";

export async function rpcListActiveListings(productHandle: string): Promise<ActiveListingRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("list_active_listings", { p_product_handle: productHandle });
  if (error) throw error;
  return (data ?? []) as ActiveListingRow[];
}

export async function rpcListOpenBids(productHandle: string): Promise<OpenBidRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("list_open_bids", { p_product_handle: productHandle });
  if (error) throw error;
  return (data ?? []) as OpenBidRow[];
}

export async function rpcListRecentSales(productHandle: string): Promise<RecentSaleRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("list_recent_sales", { p_product_handle: productHandle, p_limit: 80 });
  if (error) throw error;
  return (data ?? []) as RecentSaleRow[];
}

function readableRpcError(error: { message?: string; details?: string; hint?: string }): Error {
  const raw = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  if (raw.includes("cannot_buy_own_listing")) {
    return new Error("You cannot buy your own listing. Sign in with a different buyer account to test checkout.");
  }
  if (raw.includes("listing_unavailable")) {
    return new Error("This listing is no longer available. Refresh the page and choose another ask.");
  }
  if (raw.includes("listing_not_found")) {
    return new Error("This listing was not found. Refresh the page and try again.");
  }
  if (raw.includes("not_authenticated")) {
    return new Error("Sign in to buy from a peer.");
  }
  if (raw.includes("trade_not_releasable")) {
    return new Error("This checkout reservation is no longer active.");
  }
  if (raw.includes("seller_shipped_not_allowed")) {
    return new Error("Create the prepaid label first, then mark the item shipped.");
  }
  if (raw.includes("bid_not_cancellable")) {
    return new Error("This bid is no longer open or cannot be cancelled.");
  }
  if (raw.includes("no_matching_bid")) {
    return new Error("No open bid meets your ask price for this size.");
  }
  if (raw.includes("invalid_price")) {
    return new Error("Enter a valid bid amount.");
  }
  return new Error(error.message ?? "P2P action failed");
}

export async function rpcTakeListing(listingId: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("P2P not configured");
  const { data, error } = await sb.rpc("take_listing", { p_listing_id: listingId });
  if (error) throw readableRpcError(error);
  if (typeof data !== "string") throw new Error("Unexpected take_listing response");
  return data;
}

function safeFileName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "photo";
}

export async function uploadListingPhotos(files: File[], listingId: string): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("P2P not configured");
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr) throw userErr;
  if (!userData.user) throw new Error("Sign in to upload listing photos");

  const urls: string[] = [];
  for (const file of files.slice(0, 6)) {
    if (!file.type.startsWith("image/")) throw new Error("Listing photos must be image files.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Each listing photo must be 5 MB or smaller.");

    const path = `${userData.user.id}/${listingId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await sb.storage.from("listing-photos").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(`${error.message}. Run the listing intake migration and confirm the listing-photos bucket exists.`);

    const { data } = sb.storage.from("listing-photos").getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

export async function insertListing(input: {
  id?: string;
  product_handle: string;
  size_label: string;
  catalog_variant_id: string | null;
  price_cents: number;
  currency: string;
  condition?: ListingCondition;
  photo_urls?: string[];
  defects?: string;
  box_included?: boolean;
  sku?: string;
  seller_notes?: string;
  verification_requirements_accepted_at?: string | null;
}): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("P2P not configured");
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr) throw userErr;
  if (!userData.user) throw new Error("Sign in to create a listing");
  const listingId = input.id ?? crypto.randomUUID();
  const { error } = await sb.from("p2p_listings").insert({
    id: listingId,
    seller_id: userData.user.id,
    product_handle: input.product_handle,
    size_label: input.size_label,
    catalog_variant_id: input.catalog_variant_id,
    price_cents: input.price_cents,
    currency: input.currency,
    condition: input.condition,
    photo_urls: input.photo_urls ?? [],
    defects: input.defects?.trim() || null,
    box_included: Boolean(input.box_included),
    sku: input.sku?.trim() || null,
    seller_notes: input.seller_notes?.trim() || null,
    verification_requirements_accepted_at: input.verification_requirements_accepted_at ?? null,
  });
  if (error) throw error;
  return listingId;
}

export type PlaceBidResult = {
  bidId: string;
  matched: boolean;
  tradeId: string | null;
  matchPriceCents: number | null;
};

export async function rpcPlaceBid(input: {
  product_handle: string;
  size_label: string;
  max_price_cents: number;
  currency: string;
}): Promise<PlaceBidResult> {
  const sb = getSupabase();
  if (!sb) throw new Error("P2P not configured");
  const { data, error } = await sb.rpc("place_bid", {
    p_product_handle: input.product_handle,
    p_size_label: input.size_label,
    p_max_price_cents: input.max_price_cents,
    p_currency: input.currency,
  });
  if (error) throw readableRpcError(error);
  const row = (data ?? {}) as {
    bid_id?: string;
    matched?: boolean;
    trade_id?: string | null;
    match_price_cents?: number | null;
  };
  if (!row.bid_id) throw new Error("Unexpected place_bid response");
  return {
    bidId: row.bid_id,
    matched: Boolean(row.matched),
    tradeId: row.trade_id ?? null,
    matchPriceCents: row.match_price_cents ?? null,
  };
}

/** @deprecated Use rpcPlaceBid — kept for callers that only need an insert without match metadata. */
export async function insertBid(input: {
  product_handle: string;
  size_label: string;
  max_price_cents: number;
  currency: string;
}): Promise<void> {
  await rpcPlaceBid(input);
}

export async function rpcCancelBid(bidId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("P2P not configured");
  const { error } = await sb.rpc("cancel_bid", { p_bid_id: bidId });
  if (error) throw readableRpcError(error);
}

export async function rpcSellListingToBid(listingId: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("P2P not configured");
  const { data, error } = await sb.rpc("sell_listing_to_bid", { p_listing_id: listingId });
  if (error) throw readableRpcError(error);
  if (typeof data !== "string") throw new Error("Unexpected sell_listing_to_bid response");
  return data;
}

export async function rpcCancelListing(listingId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("P2P not configured");
  const { error } = await sb.rpc("cancel_listing", { p_listing_id: listingId });
  if (error) throw error;
}

export async function rpcUpdateActiveListing(input: {
  listingId: string;
  priceCents: number;
  condition: ListingCondition;
  photoUrls: string[];
  defects: string;
  boxIncluded: boolean;
  sku: string;
  sellerNotes: string;
  verificationAccepted: boolean;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("P2P not configured");
  const { error } = await sb.rpc("update_active_listing", {
    p_listing_id: input.listingId,
    p_price_cents: input.priceCents,
    p_condition: input.condition,
    p_photo_urls: input.photoUrls,
    p_defects: input.defects,
    p_box_included: input.boxIncluded,
    p_sku: input.sku,
    p_seller_notes: input.sellerNotes,
    p_verification_requirements_accepted: input.verificationAccepted,
  });
  if (error) {
    const raw = [error.message, error.details, error.hint].filter(Boolean).join(" ");
    if (raw.includes("listing_not_editable")) {
      throw new Error("This listing can no longer be edited because it is reserved or already in a sale process.");
    }
    if (raw.includes("photos_required")) throw new Error("Keep at least one listing photo.");
    if (raw.includes("verification_requirements_required")) throw new Error("Accept the verification requirements before saving.");
    throw error;
  }
}

export async function rpcCancelReservedTrade(tradeId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("P2P not configured");
  const { error } = await sb.rpc("cancel_reserved_trade", { p_trade_id: tradeId });
  if (error) throw readableRpcError(error);
}

export async function rpcSellerMarkTradeShipped(tradeId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("P2P not configured");
  const { error } = await sb.rpc("seller_mark_trade_shipped", { p_trade_id: tradeId });
  if (error) throw readableRpcError(error);
}

export function moneyFromCents(cents: number, currency: string): Money {
  return { amount: (cents / 100).toFixed(2), currencyCode: currency };
}

export function lowestListingForSize(listings: ActiveListingRow[], sizeLabel: string): ActiveListingRow | null {
  const subset = listings.filter((l) => l.size_label === sizeLabel).sort((a, b) => a.price_cents - b.price_cents);
  return subset[0] ?? null;
}

export function highestBidForSize(bids: OpenBidRow[], sizeLabel: string): OpenBidRow | null {
  const subset = bids.filter((b) => b.size_label === sizeLabel).sort((a, b) => b.max_price_cents - a.max_price_cents);
  return subset[0] ?? null;
}

export function lastSaleForSize(sales: RecentSaleRow[], sizeLabel: string): Money | null {
  const hit = sales.find((s) => s.size_label === sizeLabel);
  return hit ? moneyFromCents(hit.price_cents, hit.currency) : null;
}

export function aggregateListingsToAsks(listings: ActiveListingRow[], sizeLabel: string): BookEntry[] {
  const subset = listings.filter((l) => l.size_label === sizeLabel);
  const levels = new Map<number, number>();
  for (const l of subset) {
    levels.set(l.price_cents, (levels.get(l.price_cents) ?? 0) + 1);
  }
  return [...levels.entries()]
    .sort(([a], [b]) => a - b)
    .map(([price_cents, qty], i) => ({
      id: `ask-${price_cents}-${i}`,
      side: "ask" as const,
      qty,
      price: moneyFromCents(price_cents, subset[0]?.currency ?? "USD"),
    }));
}

export function aggregateBidsToBook(bids: OpenBidRow[], sizeLabel: string): BookEntry[] {
  const subset = bids.filter((b) => b.size_label === sizeLabel);
  const levels = new Map<number, number>();
  for (const b of subset) {
    levels.set(b.max_price_cents, (levels.get(b.max_price_cents) ?? 0) + 1);
  }
  return [...levels.entries()]
    .sort(([a], [b]) => b - a)
    .map(([price_cents, qty], i) => ({
      id: `bid-${price_cents}-${i}`,
      side: "bid" as const,
      qty,
      price: moneyFromCents(price_cents, subset[0]?.currency ?? "USD"),
    }));
}
