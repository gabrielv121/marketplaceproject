/** Marketplace catalog product (Supabase `catalog_products` or bundled local seed). */

export type CatalogProductSummary = {
  id: string;
  handle: string;
  title: string;
  featuredImageUrl: string | null;
  priceRange: { min: string; max: string; currency: string };
  /** Brand / maker name */
  brand?: string | null;
  tags?: string[];
  productType?: string | null;
  /** Normalized catalog aisle; from `dept-*` tags or `department_slug` in DB */
  departmentSlug?: string | null;
  /** Home page rails from tags `home-*` or `home_rails` in DB */
  homeRails?: string[];
  /** From tags `activity-*` or `activities` in DB */
  activities?: string[];
  /** Which variant title list to synthesize for the order book UI */
  variantSizePreset?: "shoe" | "apparel" | "accessory";
  /** Higher numbers surface earlier in trending/product rails. */
  trendScore?: number;
  /** Optional extra catalog imagery from Supabase. */
  imageGallery?: string[];
  /** Optional source/reference URL for catalog import provenance. */
  sourceUrl?: string | null;
  /** Display/category metadata for search and future filters. */
  category?: string | null;
  /** Department-adjacent gender/audience metadata from DB. */
  gender?: "men" | "women" | "kids" | "unisex" | null;
};

export type CatalogProductDetail = CatalogProductSummary & {
  description: string;
  variants: { id: string; title: string; price: string; currency: string; available: boolean }[];
};
