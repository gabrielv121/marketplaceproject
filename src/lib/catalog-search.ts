import type { CatalogProductSummary } from "./catalog-product";

/** Words that shouldn't exclude near-matches (e.g. "brick by brick" vs "Brick After Brick"). */
const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "x",
]);

/** Split a user query into meaningful search tokens. */
export function tokenizeCatalogSearchQuery(query: string): string[] {
  const raw = query
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const meaningful = raw.filter((t) => !SEARCH_STOP_WORDS.has(t) && t.length > 1);
  // If the query was only stop words ("by", "the"), fall back to raw tokens.
  return meaningful.length ? meaningful : raw;
}

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

  // Common catalog synonyms (search "sneakers" should hit product_type "sneaker").
  const synonyms: Record<string, string[]> = {
    sneakers: ["sneaker", "sneakers", "footwear"],
    sneaker: ["sneaker", "sneakers", "footwear"],
    apparel: ["apparel", "clothing"],
    designer: ["designer", "avant-garde", "featured-designer"],
  };
  const alias = synonyms[t];
  if (alias?.some((a) => f === a || f.split(/[-_]/).includes(a))) return true;

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
