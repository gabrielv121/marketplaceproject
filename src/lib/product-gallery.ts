import type { CatalogProductSummary } from "@/lib/catalog-product";
import { isStockxPlaceholderImageUrl } from "@/lib/catalog-image-quality";
import { resolveFeaturedImageUrl } from "@/lib/catalog-images";

const SPIN_FRAMES = [1, 10, 19, 28];

function pushUnique(list: string[], seen: Set<string>, raw: string | null | undefined) {
  const url = raw?.trim();
  if (!url || seen.has(url) || isStockxPlaceholderImageUrl(url)) return;
  seen.add(url);
  list.push(url);
}

function stockxStem(url: string): string | null {
  try {
    const file = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    const stem = file
      .replace(/\.(jpe?g|png|webp)$/i, "")
      .replace(/-product(-\d+)?$/i, "")
      .replace(/-\d+$/i, "");
    return stem || null;
  } catch {
    return null;
  }
}

function numberedSiblings(url: string): string[] {
  try {
    const parsed = new URL(url);
    const file = decodeURIComponent(parsed.pathname.split("/").pop() ?? "");
    const match = file.match(/^(.*)\.(jpe?g|png|webp)$/i);
    if (!match) return [];
    const base = match[1];
    const ext = match[2];
    const rootName = base.replace(/-product$/i, "");
    const names = new Set<string>();
    for (const n of [2, 3, 4]) {
      names.add(`${rootName}-${n}.${ext}`);
      names.add(`${base}-${n}.${ext}`);
    }
    return [...names].map((name) => `${parsed.origin}/images/${encodeURIComponent(name)}${parsed.search}`);
  } catch {
    return [];
  }
}

/** Photos we already stored, plus extra StockX angles to try when there are fewer than four. */
export function productSlideSources(
  product: Pick<CatalogProductSummary, "handle" | "featuredImageUrl" | "imageGallery" | "title">,
): { known: string[]; extras: string[] } {
  const seen = new Set<string>();
  const known: string[] = [];
  pushUnique(known, seen, product.featuredImageUrl);
  for (const url of product.imageGallery ?? []) pushUnique(known, seen, url);
  if (known.length === 0) pushUnique(known, seen, resolveFeaturedImageUrl(product));

  const extras: string[] = [];
  const primary = known[0];
  if (!primary || known.length >= 4 || !/images\.stockx\.com/i.test(primary)) {
    return { known, extras };
  }

  const stem = stockxStem(primary);
  if (stem) {
    for (const frame of SPIN_FRAMES) {
      const id = String(frame).padStart(2, "0");
      const encoded = encodeURIComponent(stem);
      pushUnique(
        extras,
        seen,
        `https://images.stockx.com/360/${encoded}/Images/${encoded}/Lv2/img${id}.jpg`,
      );
    }
  }
  for (const url of numberedSiblings(primary)) pushUnique(extras, seen, url);
  return { known, extras };
}
