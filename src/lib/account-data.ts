import { getSupabase } from "@/lib/supabase";

export type ProfileRow = {
  id: string;
  display_name: string | null;
  phone: string | null;
  created_at: string;
  stripe_account_id: string | null;
};

export type ProfileAddressRow = {
  id: string;
  created_at: string;
  label: string;
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal: string;
  country: string;
  is_default: boolean;
};

export type MyListingRow = {
  id: string;
  created_at: string;
  product_handle: string;
  size_label: string;
  price_cents: number;
  currency: string;
  status: string;
  condition: string | null;
  photo_urls: string[];
  defects: string | null;
  box_included: boolean | null;
  sku: string | null;
  seller_notes: string | null;
  verification_requirements_accepted_at: string | null;
};

export type MyBidRow = {
  id: string;
  created_at: string;
  product_handle: string;
  size_label: string;
  max_price_cents: number;
  currency: string;
  status: string;
};

export type MyTradeRow = {
  id: string;
  created_at: string;
  buyer_id: string;
  seller_id: string;
  product_handle: string;
  size_label: string;
  price_cents: number;
  currency: string;
  status: string;
  stripe_checkout_session_id: string | null;
  buyer_shipping_cents?: number | null;
  buyer_processing_fee_cents?: number | null;
  seller_inbound_label_cents?: number | null;
  seller_fee_cents?: number | null;
  seller_net_payout_cents?: number | null;
  buyer_total_cents?: number | null;
  seller_label_url?: string | null;
  seller_label_carrier?: string | null;
  seller_label_service?: string | null;
  seller_tracking_number?: string | null;
  paid_at?: string | null;
  seller_shipped_at?: string | null;
  received_by_exch_at?: string | null;
  verified_at?: string | null;
  shipped_to_buyer_at?: string | null;
  delivered_to_buyer_at?: string | null;
  payout_available_at?: string | null;
  payout_paid_at?: string | null;
  refunded_at?: string | null;
  role: "buyer" | "seller";
};

export async function fetchMyProfile(): Promise<ProfileRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: auth, error: authErr } = await sb.auth.getUser();
  if (authErr || !auth.user) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("id, display_name, phone, created_at, stripe_account_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export async function updateMyProfile(input: { displayName: string; phone: string }): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Not configured");
  const { data: auth, error: authErr } = await sb.auth.getUser();
  if (authErr || !auth.user) throw new Error("Sign in required");
  const name = input.displayName.trim();
  const phone = input.phone.trim();
  const { error } = await sb.from("profiles").upsert(
    { id: auth.user.id, display_name: name || null, phone: phone || null },
    { onConflict: "id" },
  );
  if (error) throw error;
}

export async function fetchMyAddresses(): Promise<ProfileAddressRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("profile_addresses")
    .select("id, created_at, label, name, line1, line2, city, region, postal, country, is_default")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProfileAddressRow[];
}

export async function upsertMyAddress(input: Omit<ProfileAddressRow, "id" | "created_at"> & { id?: string }): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Not configured");
  const { data: auth, error: authErr } = await sb.auth.getUser();
  if (authErr || !auth.user) throw new Error("Sign in required");

  const payload: Omit<ProfileAddressRow, "id" | "created_at"> & { id?: string; user_id: string } = {
    user_id: auth.user.id,
    label: input.label.trim() || "Home",
    name: input.name.trim(),
    line1: input.line1.trim(),
    line2: input.line2.trim(),
    city: input.city.trim(),
    region: input.region.trim(),
    postal: input.postal.trim(),
    country: input.country.trim() || "US",
    is_default: input.is_default,
  };
  if (input.id) payload.id = input.id;

  if (payload.is_default) {
    const { error: clearErr } = await sb.from("profile_addresses").update({ is_default: false }).eq("user_id", auth.user.id);
    if (clearErr) throw clearErr;
  }

  const { error } = await sb.from("profile_addresses").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function fetchMyListings(): Promise<MyListingRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("p2p_listings")
    .select(
      "id, created_at, product_handle, size_label, price_cents, currency, status, condition, photo_urls, defects, box_included, sku, seller_notes, verification_requirements_accepted_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MyListingRow[];
}

export async function fetchMyBids(): Promise<MyBidRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("p2p_bids")
    .select("id, created_at, product_handle, size_label, max_price_cents, currency, status")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MyBidRow[];
}

export async function fetchMyTrades(): Promise<MyTradeRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data: auth, error: authErr } = await sb.auth.getUser();
  if (authErr || !auth.user) return [];
  const uid = auth.user.id;
  const { data, error } = await sb
    .from("p2p_trades")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Omit<MyTradeRow, "role">[];
  return rows.map((r) => ({
    ...r,
    role: r.buyer_id === uid ? "buyer" : "seller",
  }));
}
