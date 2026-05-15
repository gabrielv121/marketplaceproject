import type { CatalogProductSummary } from "@/lib/catalog-product";
import { DEMO_PRODUCTS } from "@/lib/demo-catalog";

export function getDemoSummaryByHandle(handle: string): CatalogProductSummary | undefined {
  return DEMO_PRODUCTS.find((p) => p.handle === handle);
}

/** Best image URL for tiles and product pages (DB, gallery, then bundled seed). */
export function resolveFeaturedImageUrl(
  product: Pick<CatalogProductSummary, "handle" | "featuredImageUrl" | "imageGallery">,
): string | null {
  const primary = product.featuredImageUrl?.trim();
  if (primary) return primary;
  const fromGallery = product.imageGallery?.map((u) => u?.trim()).find(Boolean);
  if (fromGallery) return fromGallery;
  return getDemoSummaryByHandle(product.handle)?.featuredImageUrl ?? null;
}

export function withResolvedFeaturedImage<T extends CatalogProductSummary>(product: T): T {
  const url = resolveFeaturedImageUrl(product);
  if (!url || url === product.featuredImageUrl) return product;
  return { ...product, featuredImageUrl: url };
}
