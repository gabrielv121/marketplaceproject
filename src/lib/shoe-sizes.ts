import { normalizeSizeLabel } from "@/lib/size-labels";
import type { ActiveListingRow, OpenBidRow, RecentSaleRow } from "@/lib/p2p";
import {
  highestBidForSize,
  lastSaleForSize,
  lowestListingForSize,
  moneyFromCents,
} from "@/lib/p2p";
import type { SizeRow } from "@/types/marketplace";

export type ShoeGender = "men" | "women";
export type ShoeSizeSystem = "us" | "eu" | "uk" | "cm" | "kr";

export type ShoeSizeSpec = {
  id: string;
  gender: ShoeGender;
  /** Stored on listings, bids, and trades — e.g. `US M 10` or `US W 8`. */
  canonicalLabel: string;
  us: number;
  eu: number;
  uk: number;
  cm: number;
  kr: number;
};

/** Men's US 6–15.5 (half sizes). */
const MEN_US: Record<string, { eu: number; uk: number; cm: number }> = {
  "6": { eu: 38.5, uk: 5.5, cm: 24 },
  "6.5": { eu: 39, uk: 6, cm: 24.5 },
  "7": { eu: 40, uk: 6, cm: 25 },
  "7.5": { eu: 40.5, uk: 6.5, cm: 25.5 },
  "8": { eu: 41, uk: 7, cm: 26 },
  "8.5": { eu: 41.5, uk: 7.5, cm: 26.5 },
  "9": { eu: 42, uk: 8, cm: 27 },
  "9.5": { eu: 42.5, uk: 8.5, cm: 27.5 },
  "10": { eu: 43, uk: 9, cm: 28 },
  "10.5": { eu: 44, uk: 9.5, cm: 28.5 },
  "11": { eu: 44.5, uk: 10, cm: 29 },
  "11.5": { eu: 45, uk: 10.5, cm: 29.5 },
  "12": { eu: 46, uk: 11, cm: 30 },
  "12.5": { eu: 47, uk: 11.5, cm: 30.5 },
  "13": { eu: 47.5, uk: 12, cm: 31 },
  "14": { eu: 48.5, uk: 13, cm: 32 },
  "15": { eu: 49.5, uk: 14, cm: 33 },
  "15.5": { eu: 50, uk: 14.5, cm: 33.5 },
};

/** Women's US 6–15.5 (half sizes). */
const WOMEN_US: Record<string, { eu: number; uk: number; cm: number }> = {
  "6": { eu: 36.5, uk: 3.5, cm: 23 },
  "6.5": { eu: 37, uk: 4, cm: 23.5 },
  "7": { eu: 37.5, uk: 4.5, cm: 24 },
  "7.5": { eu: 38, uk: 5, cm: 24.5 },
  "8": { eu: 38.5, uk: 5.5, cm: 25 },
  "8.5": { eu: 39, uk: 6, cm: 25.5 },
  "9": { eu: 40, uk: 6.5, cm: 26 },
  "9.5": { eu: 40.5, uk: 7, cm: 26.5 },
  "10": { eu: 41, uk: 7.5, cm: 27 },
  "10.5": { eu: 41.5, uk: 8, cm: 27.5 },
  "11": { eu: 42, uk: 8.5, cm: 28 },
  "11.5": { eu: 42.5, uk: 9, cm: 28.5 },
  "12": { eu: 43, uk: 9.5, cm: 29 },
  "12.5": { eu: 43.5, uk: 10, cm: 29.5 },
  "13": { eu: 44, uk: 10.5, cm: 30 },
  "14": { eu: 44.5, uk: 11.5, cm: 31 },
  "15": { eu: 45.5, uk: 12.5, cm: 32 },
  "15.5": { eu: 46, uk: 13, cm: 32.5 },
};

function buildChart(gender: ShoeGender, table: Record<string, { eu: number; uk: number; cm: number }>): ShoeSizeSpec[] {
  const prefix = gender === "men" ? "M" : "W";
  return Object.entries(table).map(([usKey, row]) => {
    const us = Number(usKey);
    return {
      id: `shoe-${gender}-${usKey.replace(".", "-")}`,
      gender,
      canonicalLabel: `US ${prefix} ${usKey}`,
      us,
      eu: row.eu,
      uk: row.uk,
      cm: row.cm,
      kr: Math.round(row.cm * 10),
    };
  });
}

export const MEN_SHOE_SIZES = buildChart("men", MEN_US);
export const WOMEN_SHOE_SIZES = buildChart("women", WOMEN_US);

export { normalizeSizeLabel } from "@/lib/size-labels";

export function shoeSizesForGender(gender: ShoeGender): ShoeSizeSpec[] {
  return gender === "women" ? WOMEN_SHOE_SIZES : MEN_SHOE_SIZES;
}

export function formatShoeSizeDisplay(spec: ShoeSizeSpec, system: ShoeSizeSystem): string {
  switch (system) {
    case "us":
      return spec.gender === "women" ? `W ${spec.us}` : `M ${spec.us}`;
    case "eu":
      return String(spec.eu);
    case "uk":
      return String(spec.uk);
    case "cm":
      return `${spec.cm} cm`;
    case "kr":
      return String(spec.kr);
    default:
      return spec.canonicalLabel;
  }
}

export function formatShoeConversionLine(spec: ShoeSizeSpec): string {
  const usLine = spec.gender === "women" ? `US W ${spec.us}` : `US M ${spec.us}`;
  return `${usLine} · EU ${spec.eu} · UK ${spec.uk} · ${spec.cm} cm · KR ${spec.kr}`;
}

export function defaultShoeGenderFromProduct(gender?: string | null, departmentSlug?: string | null): ShoeGender {
  const g = (gender ?? "").toLowerCase();
  if (g === "women") return "women";
  if (g === "men" || g === "kids" || g === "unisex") return "men";
  if (departmentSlug === "women") return "women";
  return "men";
}

export function findShoeSizeByCanonicalLabel(label: string): ShoeSizeSpec | null {
  const normalized = normalizeSizeLabel(label);
  return [...MEN_SHOE_SIZES, ...WOMEN_SHOE_SIZES].find((s) => s.canonicalLabel === normalized) ?? null;
}

export function findShoeSizeById(id: string): ShoeSizeSpec | null {
  return [...MEN_SHOE_SIZES, ...WOMEN_SHOE_SIZES].find((s) => s.id === id) ?? null;
}

type BuildShoeRowsInput = {
  gender: ShoeGender;
  system: ShoeSizeSystem;
  listings: ActiveListingRow[];
  bids: OpenBidRow[];
  sales: RecentSaleRow[];
  p2p: boolean;
};

export function buildShoeSizeRows(input: BuildShoeRowsInput): SizeRow[] {
  const specs = shoeSizesForGender(input.gender);
  return specs.map((spec) => {
    const low = lowestListingForSize(input.listings, spec.canonicalLabel);
    const high = highestBidForSize(input.bids, spec.canonicalLabel);
    const lastP2p = lastSaleForSize(input.sales, spec.canonicalLabel);
    return {
      id: spec.id,
      label: formatShoeSizeDisplay(spec, input.system),
      canonicalLabel: spec.canonicalLabel,
      conversions: {
        usMen: spec.gender === "men" ? spec.us : null,
        usWomen: spec.gender === "women" ? spec.us : null,
        eu: spec.eu,
        uk: spec.uk,
        cm: spec.cm,
        kr: spec.kr,
      },
      lowestAsk: input.p2p && low ? moneyFromCents(low.price_cents, low.currency) : null,
      highestBid: input.p2p && high ? moneyFromCents(high.max_price_cents, high.currency) : null,
      lastSale: input.p2p ? lastP2p : null,
    };
  });
}

export function shoeSizeLabelForBook(selectedRow: SizeRow): string {
  return selectedRow.canonicalLabel ?? selectedRow.label;
}

export function conversionLineForSizeRow(row: SizeRow): string | null {
  if (!row.conversions) return null;
  const c = row.conversions;
  const usLine =
    c.usWomen != null ? `US W ${c.usWomen}` : c.usMen != null ? `US M ${c.usMen}` : row.canonicalLabel ?? row.label;
  return `${usLine} · EU ${c.eu} · UK ${c.uk} · ${c.cm} cm · KR ${c.kr}`;
}
