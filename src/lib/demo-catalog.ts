import type { CatalogProductDetail, CatalogProductSummary } from "./catalog-product";

const SHOE_SIZES = ["US 7", "US 7.5", "US 8", "US 8.5", "US 9", "US 9.5", "US 10", "US 10.5", "US 11"];
const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const HAT_SIZES = ["S/M", "M/L", "L/XL", "One size"];
const ACCESSORY_ONE = ["One size"];

function sizeTitlesForProduct(p: CatalogProductSummary): string[] {
  if (p.variantSizePreset === "apparel") return APPAREL_SIZES;
  if (p.variantSizePreset === "accessory") {
    return p.tags?.some((t) => t.toLowerCase().includes("headwear")) ? HAT_SIZES : ACCESSORY_ONE;
  }
  if (p.variantSizePreset === "shoe") return SHOE_SIZES;
  const inferred = inferPresetFromTags(p.tags ?? []);
  if (inferred === "apparel") return APPAREL_SIZES;
  if (inferred === "accessory") {
    return p.tags?.some((t) => t.toLowerCase().includes("headwear")) ? HAT_SIZES : ACCESSORY_ONE;
  }
  return SHOE_SIZES;
}

function inferPresetFromTags(tags: string[]): "shoe" | "apparel" | "accessory" {
  const t = tags.map((x) => x.toLowerCase()).join(" ");
  if (/\bbags?\b|\btote\b|watch|watches|chrono|headwear|\bcap\b|\bhat\b/.test(t)) return "accessory";
  if (/\bouterwear|hoodie|short|tight|tee|jersey|jacket|apparel\b/.test(t)) return "apparel";
  if (/\bsneakers|soccer|football|basketball|tennis|cleat|youth|lifestyle|runner|trainer\b/.test(t)) return "shoe";
  return "shoe";
}

/** Bundled seed catalog — tag products with `dept-*`, `home-*`, `activity-*` (same as Supabase `catalog_products`). */
export const DEMO_PRODUCTS: CatalogProductSummary[] = [
  {
    id: "demo-m-1",
    handle: "apex-runner-carbon",
    title: "Apex Runner — Carbon / Volt",
    brand: "Apex Lab",
    departmentSlug: "men",
    tags: ["dept-men", "sneakers"],
    variantSizePreset: "shoe",
    homeRails: ["trending-sneakers", "popular-local", "new-at-exch", "below-retail"],
    activities: ["running", "training"],
    featuredImageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80",
    priceRange: { min: "189.00", max: "220.00", currency: "USD" },
  },
  {
    id: "demo-m-2",
    handle: "court-classic-low",
    title: "Court Classic Low — Black Gum",
    brand: "Court Co.",
    departmentSlug: "men",
    tags: ["dept-men", "sneakers"],
    variantSizePreset: "shoe",
    homeRails: ["trending-sneakers", "popular-local"],
    activities: ["basketball", "training"],
    featuredImageUrl: "https://images.unsplash.com/photo-1606107557195-0f29c4a5b6b8?w=600&q=80",
    priceRange: { min: "95.00", max: "140.00", currency: "USD" },
  },
  {
    id: "demo-m-3",
    handle: "trail-hiker-pro",
    title: "Trail Essentials Tee — Olive",
    brand: "Summit",
    departmentSlug: "men",
    tags: ["dept-men", "outdoor", "apparel"],
    variantSizePreset: "apparel",
    homeRails: ["trending-sneakers", "featured-apparel", "popular-local"],
    activities: ["running", "training"],
    featuredImageUrl: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=600&q=80",
    priceRange: { min: "165.00", max: "210.00", currency: "USD" },
  },
  {
    id: "demo-m-4",
    handle: "tech-shell-jacket",
    title: "Tech Shell Jacket — Graphite",
    brand: "Northline",
    departmentSlug: "men",
    tags: ["dept-men", "outerwear"],
    variantSizePreset: "apparel",
    homeRails: ["featured-apparel", "popular-local", "new-at-exch"],
    activities: ["training", "running"],
    featuredImageUrl: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&q=80",
    priceRange: { min: "248.00", max: "280.00", currency: "USD" },
  },
  {
    id: "demo-w-1",
    handle: "stride-knit-rose",
    title: "Stride Knit — Rose Clay",
    brand: "Stride",
    departmentSlug: "women",
    tags: ["dept-women", "sneakers"],
    variantSizePreset: "shoe",
    homeRails: ["trending-sneakers", "popular-local", "below-retail"],
    activities: ["running"],
    featuredImageUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&q=80",
    priceRange: { min: "128.00", max: "155.00", currency: "USD" },
  },
  {
    id: "demo-w-2",
    handle: "elevate-high-stone",
    title: "Elevate High — Stone",
    brand: "Elevate",
    departmentSlug: "women",
    tags: ["dept-women", "sneakers"],
    variantSizePreset: "shoe",
    homeRails: ["trending-sneakers", "popular-local"],
    activities: ["basketball"],
    featuredImageUrl: "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=600&q=80",
    priceRange: { min: "142.00", max: "168.00", currency: "USD" },
  },
  {
    id: "demo-w-3",
    handle: "studio-slip-onyx",
    title: "Studio Slip — Onyx",
    brand: "Studio 9",
    departmentSlug: "women",
    tags: ["dept-women", "lifestyle"],
    variantSizePreset: "shoe",
    homeRails: ["trending-sneakers", "popular-local"],
    activities: ["training"],
    featuredImageUrl: "https://images.unsplash.com/photo-1579338559194-a9d2e9376fad?w=600&q=80",
    priceRange: { min: "88.00", max: "110.00", currency: "USD" },
  },
  {
    id: "demo-w-4",
    handle: "carryall-tote-ecru",
    title: "Carryall Tote — Ecru",
    brand: "Maison Row",
    departmentSlug: "women",
    tags: ["dept-women", "bags"],
    variantSizePreset: "accessory",
    homeRails: ["featured-accessories", "featured-apparel", "new-at-exch"],
    activities: ["training"],
    featuredImageUrl: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=600&q=80",
    priceRange: { min: "210.00", max: "240.00", currency: "USD" },
  },
  {
    id: "demo-k-1",
    handle: "sprinter-youth-neon",
    title: "Sprinter Youth — Neon",
    brand: "Sprinter",
    departmentSlug: "kids",
    tags: ["dept-kids", "youth"],
    variantSizePreset: "shoe",
    homeRails: ["trending-sneakers", "popular-local"],
    activities: ["running", "training"],
    featuredImageUrl: "https://images.unsplash.com/photo-1514986888952-8cd320577b68?w=600&q=80",
    priceRange: { min: "72.00", max: "95.00", currency: "USD" },
  },
  {
    id: "demo-k-2",
    handle: "court-youth-white",
    title: "Court Youth — White / Navy",
    brand: "Court Co.",
    departmentSlug: "kids",
    tags: ["dept-kids", "youth"],
    variantSizePreset: "shoe",
    homeRails: ["trending-sneakers", "below-retail", "popular-local"],
    activities: ["basketball"],
    featuredImageUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&q=80",
    priceRange: { min: "64.00", max: "82.00", currency: "USD" },
  },
  {
    id: "demo-a-1",
    handle: "chrono-field-watch",
    title: "Chrono Field Watch — Black",
    brand: "Chrono",
    departmentSlug: "accessories",
    tags: ["dept-accessories", "watches"],
    variantSizePreset: "accessory",
    homeRails: ["featured-accessories", "popular-local"],
    activities: ["training"],
    featuredImageUrl: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=600&q=80",
    priceRange: { min: "185.00", max: "220.00", currency: "USD" },
  },
  {
    id: "demo-a-2",
    handle: "twill-6panel-cap",
    title: "Twill 6-Panel — Forest",
    brand: "Northline",
    departmentSlug: "accessories",
    tags: ["dept-accessories", "headwear"],
    variantSizePreset: "accessory",
    homeRails: ["featured-accessories", "below-retail", "new-at-exch"],
    activities: ["training"],
    featuredImageUrl: "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=600&q=80",
    priceRange: { min: "38.00", max: "48.00", currency: "USD" },
  },
  {
    id: "demo-s-1",
    handle: "strike-fg-cleat-v3",
    title: "Strike FG Cleat — V3 Night",
    brand: "Strike Lab",
    departmentSlug: "men",
    tags: ["dept-men", "soccer"],
    variantSizePreset: "shoe",
    homeRails: ["trending-sneakers", "popular-local", "new-at-exch"],
    activities: ["soccer"],
    featuredImageUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&q=80",
    priceRange: { min: "210.00", max: "245.00", currency: "USD" },
  },
  {
    id: "demo-s-2",
    handle: "gridiron-speed-low",
    title: "Gridiron Speed Low — White",
    brand: "Gridiron",
    departmentSlug: "men",
    tags: ["dept-men", "football"],
    variantSizePreset: "shoe",
    homeRails: ["trending-sneakers", "popular-local"],
    activities: ["football"],
    featuredImageUrl: "https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=600&q=80",
    priceRange: { min: "118.00", max: "145.00", currency: "USD" },
  },
  {
    id: "demo-s-3",
    handle: "court-dominator-mid",
    title: "Court Dominator Mid — Royal",
    brand: "Court Co.",
    departmentSlug: "men",
    tags: ["dept-men", "basketball"],
    variantSizePreset: "shoe",
    homeRails: ["trending-sneakers", "popular-local"],
    activities: ["basketball"],
    featuredImageUrl: "https://images.unsplash.com/photo-1515524738708-e3270d8a3e42?w=600&q=80",
    priceRange: { min: "135.00", max: "160.00", currency: "USD" },
  },
  {
    id: "demo-s-4",
    handle: "pace-elite-tempo",
    title: "Pace Elite Tempo — Citrus",
    brand: "Pace",
    departmentSlug: "women",
    tags: ["dept-women", "running"],
    variantSizePreset: "shoe",
    homeRails: ["trending-sneakers", "below-retail", "popular-local"],
    activities: ["running"],
    featuredImageUrl: "https://images.unsplash.com/photo-1594882645124-2422b242087e?w=600&q=80",
    priceRange: { min: "152.00", max: "178.00", currency: "USD" },
  },
  {
    id: "demo-s-5",
    handle: "ace-court-tennis",
    title: "Ace Court — Tennis White",
    brand: "Ace",
    departmentSlug: "women",
    tags: ["dept-women", "tennis"],
    variantSizePreset: "shoe",
    homeRails: ["trending-sneakers", "new-at-exch", "popular-local"],
    activities: ["tennis"],
    featuredImageUrl: "https://images.unsplash.com/photo-1622163642998-1abc0d9dca58?w=600&q=80",
    priceRange: { min: "98.00", max: "120.00", currency: "USD" },
  },
  {
    id: "demo-s-6",
    handle: "flex-training-hoodie",
    title: "Flex Training Hoodie — Black",
    brand: "Flex",
    departmentSlug: "men",
    tags: ["dept-men", "training"],
    variantSizePreset: "apparel",
    homeRails: ["featured-apparel", "popular-local"],
    activities: ["training", "running"],
    featuredImageUrl: "https://images.unsplash.com/photo-1503341455253-b2e723ba3a8d?w=600&q=80",
    priceRange: { min: "72.00", max: "89.00", currency: "USD" },
  },
  {
    id: "demo-s-7",
    handle: "pitch-pro-short",
    title: "Pitch Pro Short — Navy",
    brand: "Strike Lab",
    departmentSlug: "men",
    tags: ["dept-men", "soccer"],
    variantSizePreset: "apparel",
    homeRails: ["featured-apparel", "below-retail", "popular-local"],
    activities: ["soccer", "training"],
    featuredImageUrl: "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?w=600&q=80",
    priceRange: { min: "48.00", max: "58.00", currency: "USD" },
  },
  {
    id: "demo-s-8",
    handle: "thermal-run-tight",
    title: "Thermal Run Tight — Graphite",
    brand: "Pace",
    departmentSlug: "women",
    tags: ["dept-women", "running"],
    variantSizePreset: "apparel",
    homeRails: ["featured-apparel", "popular-local"],
    activities: ["running"],
    featuredImageUrl: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600&q=80",
    priceRange: { min: "92.00", max: "110.00", currency: "USD" },
  },
];

const DEFAULT_DETAIL_COPY =
  "Marketplace listing. Inventory and fulfillment are managed by sellers; capture payment before completing trades.";

export function buildProductDetailFromSummary(
  base: CatalogProductSummary,
  opts?: { description?: string },
): CatalogProductDetail {
  const min = Number(base.priceRange.min);
  const sizes = sizeTitlesForProduct(base);
  const variants = sizes.map((title, i) => ({
    id: `local-var-${base.handle}-${i}`,
    title,
    price: String(Math.round(min + (i % 5) * 4)),
    currency: base.priceRange.currency,
    available: true,
  }));
  return {
    ...base,
    description: opts?.description?.trim() || DEFAULT_DETAIL_COPY,
    variants,
  };
}

export function getDemoProductByHandle(handle: string): CatalogProductDetail | null {
  const base = DEMO_PRODUCTS.find((p) => p.handle === handle);
  if (!base) return null;
  return buildProductDetailFromSummary(base, {
    description:
      "Sample listing from the bundled seed catalog. Add rows to Supabase `catalog_products` to run entirely from your database.",
  });
}
