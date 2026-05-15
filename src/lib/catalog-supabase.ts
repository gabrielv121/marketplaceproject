import type { CatalogProductDetail, CatalogProductSummary } from "./catalog-product";
import { buildProductDetailFromSummary, getDemoProductByHandle } from "./demo-catalog";
import { getSupabase } from "./supabase";

export type CatalogLoadQuery = {
  departmentSlug?: string;
  activitySlug?: string;
  sortNew?: boolean;
  limit?: number;
};

type CatalogProductRow = {
  id: string;
  handle: string;
  title: string;
  brand: string | null;
  description: string | null;
  department_slug: string | null;
  tags: string[] | null;
  product_type: string | null;
  home_rails: string[] | null;
  activities: string[] | null;
  variant_size_preset: "shoe" | "apparel" | "accessory" | null;
  featured_image_url: string | null;
  price_min: string | number;
  price_max: string | number;
  currency: string | null;
  published: boolean;
  trend_score?: string | number | null;
  image_gallery?: string[] | null;
  source_url?: string | null;
  category?: string | null;
  gender?: "men" | "women" | "kids" | "unisex" | null;
};

function numToPriceString(v: string | number): string {
  if (typeof v === "number") return v.toFixed(2);
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : String(v);
}

export function rowToSummary(r: CatalogProductRow): CatalogProductSummary {
  return {
    id: r.id,
    handle: r.handle,
    title: r.title,
    brand: r.brand?.trim() ? r.brand.trim() : null,
    departmentSlug: r.department_slug,
    tags: r.tags ?? [],
    productType: r.product_type,
    homeRails: r.home_rails ?? [],
    activities: r.activities ?? [],
    variantSizePreset: r.variant_size_preset ?? undefined,
    featuredImageUrl: r.featured_image_url,
    trendScore: r.trend_score == null ? 0 : Number(r.trend_score) || 0,
    imageGallery: r.image_gallery ?? [],
    sourceUrl: r.source_url ?? null,
    category: r.category ?? null,
    gender: r.gender ?? null,
    priceRange: {
      min: numToPriceString(r.price_min),
      max: numToPriceString(r.price_max),
      currency: r.currency?.trim() || "USD",
    },
  };
}

export type CatalogSourceInfo =
  | { mode: "db" }
  | { mode: "local_seed"; supabaseConfigured: boolean; detail?: string };

/** `mode: "db"` only when `catalog_products` exists and has ≥1 published row; otherwise bundled seed + optional error hint. */
export async function getCatalogSourceInfo(): Promise<CatalogSourceInfo> {
  const sb = getSupabase();
  if (!sb) return { mode: "local_seed", supabaseConfigured: false };
  const { data, error } = await sb.from("catalog_products").select("id").eq("published", true).limit(1);
  if (error) {
    return {
      mode: "local_seed",
      supabaseConfigured: true,
      detail: error.message,
    };
  }
  if ((data?.length ?? 0) > 0) return { mode: "db" };
  return {
    mode: "local_seed",
    supabaseConfigured: true,
    detail: "No published rows in catalog_products yet.",
  };
}

export async function catalogUsesSupabase(): Promise<boolean> {
  const info = await getCatalogSourceInfo();
  return info.mode === "db";
}

/** When the `catalog_products` table has at least one published row, the app uses DB as the sole catalog source. */
export async function fetchCatalogSummariesFromSupabase(opts: CatalogLoadQuery = {}): Promise<CatalogProductSummary[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  if (!(await catalogUsesSupabase())) return null;

  let q = sb.from("catalog_products").select("*").eq("published", true);
  if (opts.departmentSlug) q = q.eq("department_slug", opts.departmentSlug);
  if (opts.activitySlug) q = q.contains("activities", [opts.activitySlug]);
  if (opts.sortNew) q = q.order("updated_at", { ascending: false });
  else q = q.order("title");
  const lim = Math.min(Math.max(opts.limit ?? 100, 1), 2000);
  const { data, error } = await q.limit(lim);
  if (error) throw error;
  let list = (data ?? []).map((row) => rowToSummary(row as CatalogProductRow));
  const activity = opts.activitySlug;
  if (activity) list = list.filter((p) => (p.activities ?? []).includes(activity));
  return list;
}

export async function resolveProductDetailByHandle(handle: string): Promise<CatalogProductDetail | null> {
  const sb = getSupabase();
  if (sb && (await catalogUsesSupabase())) {
    const { data, error } = await sb
      .from("catalog_products")
      .select("*")
      .eq("handle", handle)
      .eq("published", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as CatalogProductRow;
    const summary = rowToSummary(row);
    const desc = row.description?.trim();
    return buildProductDetailFromSummary(summary, {
      description: desc || undefined,
    });
  }
  return getDemoProductByHandle(handle);
}
