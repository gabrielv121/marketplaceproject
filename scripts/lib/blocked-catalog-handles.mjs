/** Catalog rows removed from the app (bad/missing Kicks images). */
export const BLOCKED_CATALOG_HANDLES = new Set([
  "ugg-tasman-chestnut",
  "ugg-tazz-gazette",
  "ugg-classic-mini-ii-black",
  "ugg-neumel-chocolate",
]);

export function isBlockedCatalogHandle(handle) {
  return BLOCKED_CATALOG_HANDLES.has(String(handle ?? "").trim().toLowerCase());
}
