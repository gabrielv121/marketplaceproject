import type { CatalogProductSummary } from "@/lib/catalog-product";
import { MEN_SHOE_SIZES } from "@/lib/shoe-sizes";

const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const HAT_SIZES = ["S/M", "M/L", "L/XL", "One size"];
const ACCESSORY_ONE = ["One size"];

function inferPresetFromTags(tags: string[]): "shoe" | "apparel" | "accessory" {
  const t = tags.map((x) => x.toLowerCase()).join(" ");
  if (/\bbags?\b|\btote\b|watch|watches|chrono|headwear|\bcap\b|\bhat\b/.test(t)) return "accessory";
  if (/\bouterwear|hoodie|short|tight|tee|jersey|jacket|apparel\b/.test(t)) return "apparel";
  if (/\bsneakers|soccer|football|basketball|tennis|cleat|youth|lifestyle|runner|trainer\b/.test(t)) return "shoe";
  return "shoe";
}

export function isShoeProduct(p: Pick<CatalogProductSummary, "variantSizePreset" | "tags" | "productType">): boolean {
  if (p.variantSizePreset === "shoe") return true;
  if (p.variantSizePreset === "apparel" || p.variantSizePreset === "accessory") return false;
  const pt = (p.productType ?? "").toLowerCase();
  if (pt === "sneaker" || pt.includes("sneaker") || pt === "shoe") return true;
  return inferPresetFromTags(p.tags ?? []) === "shoe";
}

export function sizeTitlesForProduct(p: CatalogProductSummary): string[] {
  if (p.variantSizePreset === "apparel") return APPAREL_SIZES;
  if (p.variantSizePreset === "accessory") {
    return p.tags?.some((t) => t.toLowerCase().includes("headwear")) ? HAT_SIZES : ACCESSORY_ONE;
  }
  if (isShoeProduct(p)) {
    return MEN_SHOE_SIZES.map((s) => s.canonicalLabel);
  }
  const inferred = inferPresetFromTags(p.tags ?? []);
  if (inferred === "apparel") return APPAREL_SIZES;
  if (inferred === "accessory") {
    return p.tags?.some((t) => t.toLowerCase().includes("headwear")) ? HAT_SIZES : ACCESSORY_ONE;
  }
  return MEN_SHOE_SIZES.map((s) => s.canonicalLabel);
}
