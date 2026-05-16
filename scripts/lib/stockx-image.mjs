/** Shared with src/lib/catalog-image-quality.ts — keep patterns in sync. */
const PLACEHOLDER_URL =
  /product-placeholder|placeholder-default|stockx-assets\.imgix\.net\/media\/product-placeholder/i;

export function isStockxPlaceholderImageUrl(url) {
  if (!url?.trim()) return true;
  return PLACEHOLDER_URL.test(url.trim());
}

export function pickBestProductImageUrl(featured, gallery = []) {
  const seen = new Set();
  for (const raw of [featured, ...gallery]) {
    const url = raw?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (!isStockxPlaceholderImageUrl(url)) return url;
  }
  return null;
}

export function hasRealProductImage(row) {
  return Boolean(pickBestProductImageUrl(row.featured_image_url, row.image_gallery ?? []));
}
