import type { CatalogProductSummary } from "./catalog-product";

/** Fields scanned for search (description omitted — substring match caused false hits like "rugged"). */
export function catalogSearchFields(product: CatalogProductSummary): string[] {
  return [
    product.title,
    product.brand,
    product.handle,
    product.productType,
    product.departmentSlug,
    product.category,
    product.gender,
    ...(product.tags ?? []),
    ...(product.activities ?? []),
    ...(product.homeRails ?? []),
  ].filter((v): v is string => Boolean(v && String(v).trim()));
}

function textFieldMatchesTerm(field: string, term: string): boolean {
  const f = field.trim().toLowerCase();
  const t = term.toLowerCase();
  if (!f || !t) return false;
  if (f === t) return true;

  const slugParts = f.split(/[-_]/);
  if (slugParts.some((part) => part === t)) return true;

  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordBoundary = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
  return wordBoundary.test(f);
}

/** True when every query term matches at least one catalog field as a whole word/token (not a substring). */
export function catalogProductMatchesSearch(product: CatalogProductSummary, terms: string[]): boolean {
  if (!terms.length) return true;
  const fields = catalogSearchFields(product);
  return terms.every((term) => fields.some((field) => textFieldMatchesTerm(field, term)));
}
