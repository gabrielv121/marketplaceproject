import type { CatalogProductSummary } from "@/lib/catalog-product";
import { pickBestProductImageUrl, hasRealCatalogProductImage } from "@/lib/catalog-image-quality";
import { DEMO_PRODUCTS } from "@/lib/demo-catalog";

export function getDemoSummaryByHandle(handle: string): CatalogProductSummary | undefined {
  return DEMO_PRODUCTS.find((p) => p.handle === handle);
}

/** Best non-placeholder image URL for tiles and PDP (DB gallery, then bundled seed). */
export function resolveFeaturedImageUrl(
  product: Pick<CatalogProductSummary, "handle" | "featuredImageUrl" | "imageGallery">,
): string | null {
  const best = pickBestProductImageUrl(product.featuredImageUrl, product.imageGallery);
  if (best) return best;
  return getDemoSummaryByHandle(product.handle)?.featuredImageUrl ?? null;
}

/** True when the product has a real photo (not StockX placeholder art). */
export function hasCatalogFeaturedImage(
  product: Pick<CatalogProductSummary, "featuredImageUrl" | "imageGallery">,
): boolean {
  return hasRealCatalogProductImage(product);
}

export function withResolvedFeaturedImage<T extends CatalogProductSummary>(product: T): T {
  const url = resolveFeaturedImageUrl(product);
  if (!url || url === product.featuredImageUrl) return product;
  return { ...product, featuredImageUrl: url };
}
