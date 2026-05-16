import type { CatalogProductDetail, CatalogProductSummary } from "./catalog-product";
import { catalogProductMatchesSearch } from "./catalog-search";
import { withResolvedFeaturedImage } from "./catalog-images";
import { buildProductDetailFromSummary, getDemoProductByHandle } from "./demo-catalog";
import { getSupabase } from "./supabase";

export type CatalogLoadQuery = {
  departmentSlug?: string;
  activitySlug?: string;
  /** Normalized slug (e.g. `ugg`, `new-balance`) — matched case-insensitively on `brand`. */
  brandSlug?: string;
  sortNew?: boolean;
  limit?: number;
};

const CATALOG_PAGE_SIZE = 1000;

function brandSlugToIlikePattern(brandSlug: string): string {
  return brandSlug.trim().replace(/-/g, " ");
}

async function fetchPublishedCatalogRows(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  opts: CatalogLoadQuery,
  maxRows: number,
): Promise<CatalogProductRow[]> {
  const rows: CatalogProductRow[] = [];
  let offset = 0;

  while (rows.length < maxRows) {
    const pageSize = Math.min(CATALOG_PAGE_SIZE, maxRows - rows.length);
    let q = sb.from("catalog_products").select("*").eq("published", true);
    if (opts.departmentSlug === "accessories") {
      q = q.or(
        "department_slug.eq.accessories,tags.cs.{dept-accessories},product_type.eq.accessory,tags.cs.{accessory},tags.cs.{home-featured-accessories},home_rails.cs.{featured-accessories}",
      );
    } else if (opts.departmentSlug) {
      const dept = opts.departmentSlug;
      q = q.or(`department_slug.eq.${dept},tags.cs.{dept-${dept}}`);
    }
    if (opts.activitySlug) q = q.contains("activities", [opts.activitySlug]);
    if (opts.brandSlug) q = q.ilike("brand", brandSlugToIlikePattern(opts.brandSlug));
    if (opts.sortNew) q = q.order("updated_at", { ascending: false });
    else q = q.order("trend_score", { ascending: false, nullsFirst: false }).order("title");
    const { data, error } = await q.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as CatalogProductRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

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
    featuredImageUrl: r.featured_image_url?.trim() || null,
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

  const lim = Math.min(Math.max(opts.limit ?? 100, 1), 5000);
  const data = await fetchPublishedCatalogRows(sb, opts, lim);
  let list = data.map((row) => withResolvedFeaturedImage(rowToSummary(row)));
  const activity = opts.activitySlug;
  if (activity) list = list.filter((p) => (p.activities ?? []).includes(activity));
  return list;
}

/** Server-side catalog search (avoids loading the full catalog client-side). */
export async function searchCatalogSummariesFromSupabase(query: string): Promise<CatalogProductSummary[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  if (!(await catalogUsesSupabase())) return null;

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return fetchCatalogSummariesFromSupabase({ limit: 500 });

  const primary = terms[0]!;
  const pattern = `%${primary}%`;
  // Description excluded: ilike %ugg% matched "rugged", "UGGplush", etc. and pulled unrelated brands.
  const orFilter = [
    `title.ilike.${pattern}`,
    `brand.ilike.${pattern}`,
    `handle.ilike.${pattern}`,
    `product_type.ilike.${pattern}`,
    `category.ilike.${pattern}`,
  ].join(",");

  const rows: CatalogProductRow[] = [];
  let offset = 0;
  const maxRows = 500;

  while (rows.length < maxRows) {
    const pageSize = Math.min(CATALOG_PAGE_SIZE, maxRows - rows.length);
    const { data, error } = await sb
      .from("catalog_products")
      .select("*")
      .eq("published", true)
      .or(orFilter)
      .order("title")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as CatalogProductRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return rows
    .map((row) => withResolvedFeaturedImage(rowToSummary(row)))
    .filter((product) => catalogProductMatchesSearch(product, terms));
}

export type CatalogBrandRow = { name: string; slug: string; count: number };

function normalizeBrandSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Distinct brands with counts — paginates lightweight `brand` column reads. */
export async function listCatalogBrandsFromSupabase(): Promise<CatalogBrandRow[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  if (!(await catalogUsesSupabase())) return null;

  const counts = new Map<string, { name: string; count: number }>();
  let offset = 0;

  while (true) {
    const { data, error } = await sb
      .from("catalog_products")
      .select("brand")
      .eq("published", true)
      .not("brand", "is", null)
      .order("brand")
      .range(offset, offset + CATALOG_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    for (const row of page) {
      const name = (row.brand as string | null)?.trim();
      if (!name) continue;
      const slug = normalizeBrandSlug(name);
      const cur = counts.get(slug);
      if (cur) cur.count += 1;
      else counts.set(slug, { name, count: 1 });
    }
    if (page.length < CATALOG_PAGE_SIZE) break;
    offset += CATALOG_PAGE_SIZE;
  }

  return [...counts.entries()]
    .map(([slug, v]) => ({ slug, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Single product for order/trade views — includes unpublished rows so past trades still resolve. */
export async function fetchCatalogSummaryByHandle(handle: string): Promise<CatalogProductSummary | null> {
  const sb = getSupabase();
  if (sb && (await catalogUsesSupabase())) {
    const { data, error } = await sb.from("catalog_products").select("*").eq("handle", handle).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return withResolvedFeaturedImage(rowToSummary(data as CatalogProductRow));
  }
  return getDemoProductByHandle(handle);
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
    const summary = withResolvedFeaturedImage(rowToSummary(row));
    const desc = row.description?.trim();
    return buildProductDetailFromSummary(summary, {
      description: desc || undefined,
    });
  }
  return getDemoProductByHandle(handle);
}
