import { getSupabase } from "@/lib/supabase";

export type AdminDateRange = "7d" | "30d" | "90d" | "all";

export function sinceForRange(range: AdminDateRange): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function readableAdminError(error: { message?: string; details?: string; hint?: string }): Error {
  const raw = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  if (raw.includes("not_admin")) return new Error("Admin access required.");
  return new Error(error.message ?? "Admin analytics failed");
}

async function rpcJson<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb.rpc(name, args);
  if (error) throw readableAdminError(error);
  return data as T;
}

export type AdminOverview = {
  users_total: number;
  users_since: number;
  users_unverified: number;
  listings_active: number;
  listings_since: number;
  orders_paid_since: number;
  gmv_cents_since: number;
  revenue_cents_since: number;
  payouts_released_cents_since: number;
  connect_incomplete: number;
  search_events_since: number;
  product_views_since: number;
};

export type AdminUserGrowth = {
  verified_total: number;
  unverified_total: number;
  daily: Array<{ day: string; signups: number }>;
  recent: Array<{
    id: string;
    created_at: string;
    display_name: string | null;
    email_verified: boolean;
    email: string | null;
  }>;
};

export type AdminListingsAnalytics = {
  by_status: Record<string, number>;
  daily: Array<{ day: string; created: number }>;
  top_products: Array<{
    product_handle: string;
    product_title: string | null;
    brand: string | null;
    listings: number;
  }>;
};

export type AdminOrdersAnalytics = {
  by_status: Record<string, number>;
  daily: Array<{ day: string; orders: number; gmv_cents: number }>;
};

export type AdminRevenueAnalytics = {
  buyer_fee_cents: number;
  seller_fee_cents: number;
  total_revenue_cents: number;
  payouts_released_cents: number;
  daily: Array<{
    day: string;
    buyer_fee_cents: number;
    seller_fee_cents: number;
    total_cents: number;
  }>;
};

export type AdminSellerRow = {
  seller_id: string;
  seller_email: string | null;
  display_name: string | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  stripe_details_submitted: boolean | null;
  listings: number;
  sold: number;
  gmv_cents: number;
  seller_fee_cents: number;
};

export type AdminSearchAnalytics = {
  total_events: number;
  top_queries: Array<{
    query: string;
    searches: number;
    avg_results: number;
    clicks: number;
  }>;
  zero_result_queries: Array<{ query: string; searches: number }>;
  recent: Array<{
    id: string;
    created_at: string;
    query: string;
    result_count: number;
    clicked_handle: string | null;
    user_id: string | null;
  }>;
};

export type AdminAuthQueue = {
  unverified: Array<{
    id: string;
    created_at: string;
    display_name: string | null;
    email_verified: boolean;
    email_verify_token_expires_at: string | null;
    email: string | null;
  }>;
  connect_incomplete: Array<{
    seller_id: string;
    seller_email: string | null;
    display_name: string | null;
    stripe_account_id: string | null;
    stripe_charges_enabled: boolean | null;
    stripe_payouts_enabled: boolean | null;
    stripe_details_submitted: boolean | null;
    listings: number;
    sales: number;
  }>;
};

export type AdminActivityRow = {
  at: string;
  kind: string;
  subject: string;
  detail: string;
  actor_id: string | null;
};

export async function fetchAdminOverview(range: AdminDateRange): Promise<AdminOverview> {
  return rpcJson("admin_analytics_overview", { p_since: sinceForRange(range) });
}

export async function fetchAdminUserGrowth(range: AdminDateRange): Promise<AdminUserGrowth> {
  return rpcJson("admin_analytics_user_growth", { p_since: sinceForRange(range) });
}

export async function fetchAdminListingsAnalytics(range: AdminDateRange): Promise<AdminListingsAnalytics> {
  return rpcJson("admin_analytics_listings", { p_since: sinceForRange(range) });
}

export async function fetchAdminOrdersAnalytics(range: AdminDateRange): Promise<AdminOrdersAnalytics> {
  return rpcJson("admin_analytics_orders", { p_since: sinceForRange(range) });
}

export async function fetchAdminRevenueAnalytics(range: AdminDateRange): Promise<AdminRevenueAnalytics> {
  return rpcJson("admin_analytics_revenue", { p_since: sinceForRange(range) });
}

export async function fetchAdminSellers(range: AdminDateRange): Promise<AdminSellerRow[]> {
  const data = await rpcJson<AdminSellerRow[]>("admin_analytics_sellers", { p_since: sinceForRange(range) });
  return Array.isArray(data) ? data : [];
}

export async function fetchAdminSearchAnalytics(range: AdminDateRange): Promise<AdminSearchAnalytics> {
  return rpcJson("admin_analytics_search", { p_since: sinceForRange(range) });
}

export async function fetchAdminAuthQueue(): Promise<AdminAuthQueue> {
  return rpcJson("admin_list_auth_queue");
}

export async function fetchAdminActivity(limit = 60): Promise<AdminActivityRow[]> {
  const data = await rpcJson<AdminActivityRow[]>("admin_analytics_activity", { p_limit: limit });
  return Array.isArray(data) ? data : [];
}
