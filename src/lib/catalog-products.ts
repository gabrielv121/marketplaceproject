import { DEMO_PRODUCTS } from "@/lib/demo-catalog";
import { catalogProductMatchesSearch } from "@/lib/catalog-search";
import { inferDepartmentSlugFromTags } from "@/lib/catalog-taxonomy";
import { withResolvedFeaturedImage } from "@/lib/catalog-images";
import { enrichProductsForHome, isCatalogAccessoryCandidate } from "@/lib/home-feed";
import {
  fetchCatalogSummariesFromSupabase,
  listCatalogBrandsFromSupabase,
  searchCatalogSummariesFromSupabase,
} from "@/lib/catalog-supabase";
import type { CatalogProductSummary } from "@/lib/catalog-product";

export type CatalogLoadOptions = {
  departmentSlug?: string;
  brandSlug?: string;
  activitySlug?: string;
  /** Prefer recently updated products (Supabase `updated_at`). */
  sortNew?: boolean;
  limit?: number;
};

function normalizeBrand(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function productBrand(p: CatalogProductSummary): string | null {
  return p.brand?.trim() ? p.brand.trim() : null;
}

function filterList(products: CatalogProductSummary[], opts: CatalogLoadOptions): CatalogProductSummary[] {
  let list = products;
  if (opts.departmentSlug) {
    list = list.filter((p) => p.departmentSlug === opts.departmentSlug);
  }
  if (opts.brandSlug) {
    const want = opts.brandSlug.toLowerCase();
    list = list.filter((p) => {
      const b = productBrand(p);
      return b && normalizeBrand(b) === want;
    });
  }
  if (opts.activitySlug) {
    list = list.filter((p) => (p.activities ?? []).includes(opts.activitySlug!));
  }
  return list;
}

function trendSort(products: CatalogProductSummary[]): CatalogProductSummary[] {
  return [...products].sort((a, b) => {
    const score = (b.trendScore ?? 0) - (a.trendScore ?? 0);
    return score || a.title.localeCompare(b.title);
  });
}

function resolveDepartmentSlug(p: CatalogProductSummary): string | null {
  if (isCatalogAccessoryCandidate(p)) return "accessories";
  return inferDepartmentSlugFromTags(p.tags ?? []) ?? p.departmentSlug ?? null;
}

function matchesDepartment(p: CatalogProductSummary, deptSlug: string): boolean {
  if (deptSlug === "accessories") return isCatalogAccessoryCandidate(p);
  return resolveDepartmentSlug(p) === deptSlug;
}

export async function loadCatalogProducts(opts: CatalogLoadOptions = {}): Promise<{
  products: CatalogProductSummary[];
  error: string | null;
  /** `supabase` when `catalog_products` has published rows; otherwise bundled local seed. */
  catalogSource: "supabase" | "local";
}> {
  const deptSlug = opts.departmentSlug;
  const fetchLimit = deptSlug ? (opts.limit ?? 3000) : (opts.limit ?? 500);

  try {
    // Department aisles: load a wide published set, then match `dept-*` tags + department_slug
    // (KicksDB rows often use tags; a strict DB filter + 72 cap skewed Men toward one brand).
    const raw = await fetchCatalogSummariesFromSupabase({
      departmentSlug: opts.departmentSlug,
      activitySlug: opts.activitySlug,
      brandSlug: opts.brandSlug,
      sortNew: Boolean(opts.sortNew),
      limit: fetchLimit,
    });
    if (raw !== null) {
      const mapped = raw.map((p) =>
        withResolvedFeaturedImage({
          ...p,
          departmentSlug: resolveDepartmentSlug(p),
        }),
      );
      let list = deptSlug ? mapped.filter((p) => matchesDepartment(p, deptSlug)) : mapped;
      const enriched = enrichProductsForHome(list);
      const sorted = opts.sortNew ? enriched : trendSort(enriched);
      const filtered = filterList(sorted, { ...opts, departmentSlug: undefined });
      return { products: filtered, error: null, catalogSource: "supabase" };
    }
  } catch (e) {
    const demo = enrichProductsForHome([...DEMO_PRODUCTS]);
    let local = deptSlug ? demo.filter((p) => matchesDepartment(p, deptSlug)) : demo;
    if (opts.sortNew) local = [...local].reverse();
    else local = trendSort(local);
    return {
      products: filterList(local, { ...opts, departmentSlug: undefined }),
      error: e instanceof Error ? e.message : "Catalog error",
      catalogSource: "local",
    };
  }

  const demo = enrichProductsForHome([...DEMO_PRODUCTS]);
  let local = deptSlug ? demo.filter((p) => matchesDepartment(p, deptSlug)) : demo;
  if (opts.sortNew) local = [...local].reverse();
  else local = trendSort(local);
  return { products: filterList(local, { ...opts, departmentSlug: undefined }), error: null, catalogSource: "local" };
}

export async function loadCatalogBrands(): Promise<{
  brands: { name: string; slug: string; count: number }[];
  catalogSource: "supabase" | "local";
}> {
  try {
    const fromDb = await listCatalogBrandsFromSupabase();
    if (fromDb !== null) {
      return { brands: fromDb, catalogSource: "supabase" };
    }
  } catch {
    /* fall through to local seed */
  }
  const demo = enrichProductsForHome([...DEMO_PRODUCTS]);
  return { brands: listBrandsFromProducts(demo), catalogSource: "local" };
}

export async function searchCatalogProducts(query: string): Promise<{
  products: CatalogProductSummary[];
  error: string | null;
  catalogSource: "supabase" | "local";
}> {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) {
    return loadCatalogProducts({ limit: 500 });
  }

  try {
    const raw = await searchCatalogSummariesFromSupabase(query);
    if (raw !== null) {
      const mapped = raw.map((p) =>
        withResolvedFeaturedImage({
          ...p,
          departmentSlug: p.departmentSlug ?? inferDepartmentSlugFromTags(p.tags ?? []) ?? null,
        }),
      );
      const enriched = enrichProductsForHome(mapped);
      return { products: trendSort(enriched), error: null, catalogSource: "supabase" };
    }
  } catch (e) {
    const demoBase = enrichProductsForHome([...DEMO_PRODUCTS]);
    const list = demoBase.filter((p) => catalogProductMatchesSearch(p, terms));
    return {
      products: trendSort(list),
      error: e instanceof Error ? e.message : "Search error",
      catalogSource: "local",
    };
  }

  const demo = enrichProductsForHome([...DEMO_PRODUCTS]);
  const list = demo.filter((p) => catalogProductMatchesSearch(p, terms));
  return { products: trendSort(list), error: null, catalogSource: "local" };
}

export function listBrandsFromProducts(products: CatalogProductSummary[]): { name: string; slug: string; count: number }[] {
  const map = new Map<string, { name: string; count: number }>();
  for (const p of products) {
    const b = productBrand(p);
    if (!b) continue;
    const slug = normalizeBrand(b);
    const cur = map.get(slug);
    if (cur) cur.count += 1;
    else map.set(slug, { name: b, count: 1 });
  }
  return [...map.entries()]
    .map(([slug, v]) => ({ slug, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
