import type { CatalogProductDetail, CatalogProductSummary } from "./catalog-product";
import { catalogProductMatchesSearch, tokenizeCatalogSearchQuery } from "./catalog-search";
import { withResolvedFeaturedImage } from "./catalog-images";
import { BLOCKED_CATALOG_HANDLES } from "./blocked-catalog-handles";
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

/** Normalize brand URL slugs: "Gallery Dept." → "gallery-dept". */
export function normalizeBrandSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Match brand column loosely so punctuation differences still hit
 * (e.g. slug `gallery-dept` → brand `Gallery Dept.`).
 */
function brandSlugToIlikePattern(brandSlug: string): string {
  const parts = normalizeBrandSlug(brandSlug).split("-").filter(Boolean);
  if (!parts.length) return brandSlug.trim();
  return `%${parts.join("%")}%`;
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
    } else if (opts.departmentSlug === "men" || opts.departmentSlug === "women") {
      const dept = opts.departmentSlug;
      q = q.or(
        `department_slug.eq.${dept},department_slug.eq.unisex,tags.cs.{dept-${dept}},tags.cs.{dept-unisex}`,
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
  created_at?: string | null;
  audience?: "men" | "women" | "kids" | "unisex" | null;
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
    createdAt: r.created_at ?? null,
    imageGallery: r.image_gallery ?? [],
    sourceUrl: r.source_url ?? null,
    category: r.category ?? null,
    gender: r.gender ?? null,
    audience: r.audience ?? null,
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

/** Newest published catalog rows, newest first. Used by the New at VRNA rail. */
export async function fetchNewestCatalogProducts(limit = 24): Promise<CatalogProductSummary[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const size = Math.min(Math.max(limit, 1), 200);
  const { data, error } = await sb
    .from("catalog_products")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(size);
  if (error || !data) return null;
  return (data as CatalogProductRow[]).map((row) => withResolvedFeaturedImage(rowToSummary(row)));
}

/** Card columns only — skips description and source_url, which tiles never show. */
const CATALOG_CARD_COLUMNS =
  "id,handle,title,brand,department_slug,tags,product_type,home_rails,activities,variant_size_preset,featured_image_url,price_min,price_max,currency,published,trend_score,image_gallery,category,gender,created_at,audience";

export type CatalogAudienceFilter = "men" | "women" | "kids" | "unisex";

export type CatalogPageSort = "trending" | "price-low" | "price-high" | "name" | "new";

export type CatalogPageQuery = {
  audiences?: CatalogAudienceFilter[];
  activitySlug?: string;
  brand?: string;
  productType?: string;
  /** Substring match on title, brand, category (the in-page "Search these products" box). */
  search?: string;
  /** Whole-word match across title, brand, handle, type, category, tags, activities, audience (the search page). */
  terms?: string[];
  sort?: CatalogPageSort;
  offset?: number;
  pageSize?: number;
};

export type CatalogPage = {
  products: CatalogProductSummary[];
  /** Only returned for the first page (offset 0). */
  total: number | null;
};

function blockedHandlesFilter(): string {
  return `(${[...BLOCKED_CATALOG_HANDLES].map((h) => `"${h}"`).join(",")})`;
}

function searchTerms(search: string | undefined): string[] {
  return (search ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9'&.\- ]+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[.\-']+|[.\-']+$/g, ""))
    .filter(Boolean)
    .slice(0, 6);
}

const AUDIENCE_TERMS = new Set(["men", "women", "kids", "unisex"]);

function wordTerms(terms: string[] | undefined): string[] {
  return [...new Set((terms ?? []).map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean))].slice(0, 6);
}

/** Mirrors the term match in the `catalog_facets` SQL function. */
function wordTermFilter(term: string): string {
  const re = `"[[:<:]]${term}[[:>:]]"`;
  const parts = [
    `title.imatch.${re}`,
    `brand.imatch.${re}`,
    `handle.imatch.${re}`,
    `product_type.imatch.${re}`,
    `category.imatch.${re}`,
    `tags.cs.{${term}}`,
    `activities.cs.{${term}}`,
  ];
  if (AUDIENCE_TERMS.has(term)) parts.push(`audience.eq.${term}`);
  return parts.join(",");
}

/** Published KicksDB rows with a real photo, filtered, sorted, and paged in the database. */
export async function fetchCatalogPage(query: CatalogPageQuery): Promise<CatalogPage | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const offset = Math.max(query.offset ?? 0, 0);
  const pageSize = Math.min(Math.max(query.pageSize ?? 60, 1), 200);

  let q = sb
    .from("catalog_products")
    .select(CATALOG_CARD_COLUMNS, offset === 0 ? { count: "exact" } : undefined)
    .eq("published", true)
    .eq("has_photo", true)
    .contains("tags", ["kicksdb"])
    .not("handle", "in", blockedHandlesFilter());
  if (query.audiences?.length) q = q.in("audience", query.audiences);
  if (query.activitySlug) q = q.contains("activities", [query.activitySlug]);
  if (query.brand) q = q.eq("brand", query.brand);
  if (query.productType) q = q.eq("product_type", query.productType);
  for (const term of searchTerms(query.search)) {
    const pattern = `%${term}%`;
    q = q.or(`title.ilike.${pattern},brand.ilike.${pattern},category.ilike.${pattern}`);
  }
  for (const term of wordTerms(query.terms)) {
    q = q.or(wordTermFilter(term));
  }

  switch (query.sort ?? "trending") {
    case "price-low":
      q = q.order("price_min", { ascending: true }).order("title").order("id");
      break;
    case "price-high":
      q = q.order("price_max", { ascending: false }).order("title").order("id");
      break;
    case "name":
      q = q.order("title").order("id");
      break;
    case "new":
      q = q.order("updated_at", { ascending: false }).order("id");
      break;
    default:
      q = q.order("trend_score", { ascending: false, nullsFirst: false }).order("title").order("id");
  }

  const { data, error, count } = await q.range(offset, offset + pageSize - 1);
  if (error) throw error;
  return {
    products: ((data ?? []) as unknown as CatalogProductRow[]).map((row) => withResolvedFeaturedImage(rowToSummary(row))),
    total: offset === 0 ? (count ?? null) : null,
  };
}

export type CatalogFacet = { name: string; count: number };

export async function fetchCatalogFacets(query: {
  audiences?: CatalogAudienceFilter[];
  activitySlug?: string;
  terms?: string[];
}): Promise<{ brands: CatalogFacet[]; types: CatalogFacet[] } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const terms = wordTerms(query.terms);
  const { data, error } = await sb.rpc("catalog_facets", {
    p_audiences: query.audiences?.length ? query.audiences : null,
    p_activity: query.activitySlug ?? null,
    p_terms: terms.length ? terms : null,
  });
  if (error) throw error;
  const rows = (data ?? []) as { kind: string; name: string; product_count: number | string }[];
  const pick = (kind: string) =>
    rows
      .filter((r) => r.kind === kind && r.name)
      .map((r) => ({ name: r.name, count: Number(r.product_count) || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  return { brands: pick("brand"), types: pick("type") };
}

/** Home rails source: every listable men's and unisex row, trend-ordered, without heavy columns. */
export async function fetchHomeCatalogSummaries(maxRows = 8000): Promise<CatalogProductSummary[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const page = (offset: number, withCount: boolean) =>
    sb
      .from("catalog_products")
      .select(CATALOG_CARD_COLUMNS, withCount ? { count: "exact" } : undefined)
      .eq("published", true)
      .eq("has_photo", true)
      .contains("tags", ["kicksdb"])
      .in("audience", ["men", "unisex"])
      .order("trend_score", { ascending: false, nullsFirst: false })
      .order("title")
      .order("id")
      .range(offset, Math.min(offset + CATALOG_PAGE_SIZE, maxRows) - 1);

  const first = await page(0, true);
  if (first.error) throw first.error;
  const total = Math.min(first.count ?? 0, maxRows);
  const offsets: number[] = [];
  for (let offset = CATALOG_PAGE_SIZE; offset < total; offset += CATALOG_PAGE_SIZE) offsets.push(offset);
  const rest = await Promise.all(offsets.map((offset) => page(offset, false)));
  const rows = [first, ...rest].flatMap((res) => {
    if (res.error) throw res.error;
    return (res.data ?? []) as unknown as CatalogProductRow[];
  });
  const seen = new Set<string>();
  const unique = rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  return unique.map((row) => withResolvedFeaturedImage(rowToSummary(row)));
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

  const terms = tokenizeCatalogSearchQuery(query);
  if (!terms.length) return fetchCatalogSummariesFromSupabase({ limit: 500 });

  const primary = terms[0]!;
  const pattern = `%${primary}%`;
  // Description excluded: ilike %ugg% matched "rugged", "UGGplush", etc. and pulled unrelated brands.
  // Also match exact tag / home_rail tokens (e.g. sneakers, below-retail, designer).
  const orFilter = [
    `title.ilike.${pattern}`,
    `brand.ilike.${pattern}`,
    `handle.ilike.${pattern}`,
    `product_type.ilike.${pattern}`,
    `category.ilike.${pattern}`,
    `tags.cs.{${primary}}`,
    `home_rails.cs.{${primary}}`,
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

const HANDLE_IN_CHUNK = 80;

/** Batch lookup for account/order lists — includes unpublished rows so past trades still resolve. */
export async function fetchCatalogSummariesByHandles(
  handles: string[],
): Promise<Map<string, CatalogProductSummary>> {
  const unique = [...new Set(handles.map((h) => h.trim()).filter(Boolean))];
  const out = new Map<string, CatalogProductSummary>();
  if (!unique.length) return out;

  const sb = getSupabase();
  if (sb && (await catalogUsesSupabase())) {
    for (let i = 0; i < unique.length; i += HANDLE_IN_CHUNK) {
      const chunk = unique.slice(i, i + HANDLE_IN_CHUNK);
      const { data, error } = await sb.from("catalog_products").select("*").in("handle", chunk);
      if (error) throw error;
      for (const row of (data ?? []) as CatalogProductRow[]) {
        out.set(row.handle, withResolvedFeaturedImage(rowToSummary(row)));
      }
    }
    return out;
  }

  for (const handle of unique) {
    const demo = getDemoProductByHandle(handle);
    if (demo) out.set(handle, demo);
  }
  return out;
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
