import type { CatalogProductSummary } from "@/lib/catalog-product";

/** StockX default tile when KicksDB has no product photo (grey X on white). */
const PLACEHOLDER_URL =
  /product-placeholder|placeholder-default|stockx-assets\.imgix\.net\/media\/product-placeholder/i;

export function isStockxPlaceholderImageUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  return PLACEHOLDER_URL.test(url.trim());
}

/** First featured or gallery URL that is not a StockX placeholder. */
export function pickBestProductImageUrl(
  featured: string | null | undefined,
  gallery: string[] | null | undefined,
): string | null {
  const seen = new Set<string>();
  for (const raw of [featured, ...(gallery ?? [])]) {
    const url = raw?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (!isStockxPlaceholderImageUrl(url)) return url;
  }
  return null;
}

export function hasRealCatalogProductImage(
  product: Pick<CatalogProductSummary, "featuredImageUrl" | "imageGallery">,
): boolean {
  return Boolean(pickBestProductImageUrl(product.featuredImageUrl, product.imageGallery));
}

/** Trending sort: real product photos first, then trend score. */
export function sortCatalogByImageQuality(products: CatalogProductSummary[]): CatalogProductSummary[] {
  return [...products].sort((a, b) => {
    const ra = hasRealCatalogProductImage(a) ? 1 : 0;
    const rb = hasRealCatalogProductImage(b) ? 1 : 0;
    if (rb !== ra) return rb - ra;
    const tr = (b.trendScore ?? 0) - (a.trendScore ?? 0);
    if (tr !== 0) return tr;
    return a.title.localeCompare(b.title);
  });
}

export function countWithoutRealProductImage(products: CatalogProductSummary[]): number {
  return products.filter((p) => !hasRealCatalogProductImage(p)).length;
}
