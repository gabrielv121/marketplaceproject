/** Catalog rows removed from the app (bad/missing Kicks images). */
export const BLOCKED_CATALOG_HANDLES = new Set([
  "ugg-tasman-chestnut",
  "ugg-tazz-gazette",
  "ugg-classic-mini-ii-black",
  "ugg-neumel-chocolate",
]);

export function isBlockedCatalogHandle(handle: string): boolean {
  return BLOCKED_CATALOG_HANDLES.has(handle.trim().toLowerCase());
}

export function withoutBlockedCatalogProducts<T extends { handle: string }>(products: T[]): T[] {
  return products.filter((p) => !isBlockedCatalogHandle(p.handle));
}
