import { DEMO_PRODUCTS } from "@/lib/demo-catalog";
import { inferDepartmentSlugFromTags } from "@/lib/catalog-taxonomy";
import { withResolvedFeaturedImage } from "@/lib/catalog-images";
import { enrichProductsForHome } from "@/lib/home-feed";
import { fetchCatalogSummariesFromSupabase } from "@/lib/catalog-supabase";
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

export async function loadCatalogProducts(opts: CatalogLoadOptions = {}): Promise<{
  products: CatalogProductSummary[];
  error: string | null;
  /** `supabase` when `catalog_products` has published rows; otherwise bundled local seed. */
  catalogSource: "supabase" | "local";
}> {
  try {
    const raw = await fetchCatalogSummariesFromSupabase({
      departmentSlug: opts.departmentSlug,
      activitySlug: opts.activitySlug,
      sortNew: Boolean(opts.sortNew),
      limit: opts.limit ?? 72,
    });
    if (raw !== null) {
      const mapped = raw.map((p) =>
        withResolvedFeaturedImage({
          ...p,
          departmentSlug: p.departmentSlug ?? inferDepartmentSlugFromTags(p.tags ?? []) ?? null,
        }),
      );
      const enriched = enrichProductsForHome(mapped);
      const filtered = filterList(opts.sortNew ? enriched : trendSort(enriched), opts);
      return { products: filtered, error: null, catalogSource: "supabase" };
    }
  } catch (e) {
    const demoBase = enrichProductsForHome([...DEMO_PRODUCTS]);
    const list = filterList(opts.sortNew ? demoBase.reverse() : trendSort(demoBase), opts);
    return {
      products: list,
      error: e instanceof Error ? e.message : "Catalog error",
      catalogSource: "local",
    };
  }

  const demo = enrichProductsForHome([...DEMO_PRODUCTS]);
  if (opts.sortNew) demo.reverse();
  return { products: filterList(opts.sortNew ? demo : trendSort(demo), opts), error: null, catalogSource: "local" };
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
