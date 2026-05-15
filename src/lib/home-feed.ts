import type { CatalogProductSummary } from "@/lib/catalog-product";
import { hasCatalogFeaturedImage } from "@/lib/catalog-images";

export const SHOP_ACTIVITIES = [
  { slug: "soccer", title: "Soccer" },
  { slug: "football", title: "Football" },
  { slug: "basketball", title: "Basketball" },
  { slug: "running", title: "Running" },
  { slug: "training", title: "Training" },
  { slug: "tennis", title: "Tennis" },
] as const;

/** Hero imagery for Shop by activity tiles (StockX-style cards). */
export const ACTIVITY_COVER: Record<string, string> = {
  soccer: "/activity/soccer.svg",
  football: "/activity/football.svg",
  basketball: "/activity/basketball.svg",
  running: "/activity/running.svg",
  training: "/activity/training.svg",
  tennis: "/activity/tennis.svg",
};

export type HomeRailSlug =
  | "trending-sneakers"
  | "featured-apparel"
  | "featured-designer"
  | "popular-local"
  | "below-retail"
  | "featured-accessories"
  | "new-at-exch";

function parseTagsForHome(tags: string[]): { rails: string[]; activities: string[] } {
  const rails: string[] = [];
  const activities: string[] = [];
  for (const t of tags) {
    const tl = t.trim().toLowerCase();
    if (tl.startsWith("home-")) rails.push(tl.slice("home-".length));
    if (tl.startsWith("activity-")) activities.push(tl.slice("activity-".length));
  }
  return { rails, activities };
}

/** Footwear for "sneakers" rails — excludes apparel-only pieces even if tagged oddly. */
export function isCatalogFootwear(p: CatalogProductSummary): boolean {
  if (p.variantSizePreset === "shoe") return true;
  const pt = (p.productType ?? "").toLowerCase();
  if (pt === "sneaker" || pt.includes("sneaker") || pt === "shoe") return true;
  const cat = (p.category ?? "").toLowerCase();
  if (/\bsneaker|cleat|boots?\b|slides?\b|sandals?\b|loafers?\b/.test(cat)) return true;
  const blob = `${p.title} ${(p.tags ?? []).join(" ")}`.toLowerCase();
  if (/\bsneaker|cleat|football boot|soccer boot|trainer\b|running shoe|basketball shoe|slide\b|sandal\b|loafer\b/.test(blob)) return true;
  return false;
}

/** Clothing layers — never includes footwear/sneakers. */
export function isCatalogApparel(p: CatalogProductSummary): boolean {
  if (isCatalogFootwear(p)) return false;
  if (p.variantSizePreset === "apparel") return true;
  const pt = (p.productType ?? "").toLowerCase();
  if (pt === "apparel") return true;
  const cat = (p.category ?? "").toLowerCase();
  const blob = `${p.title} ${cat} ${(p.tags ?? []).join(" ")}`.toLowerCase();
  if (
    /\b(jacket|coat|parka|hoodie|sweatshirt|crewneck|pullover|sweater|cardigan|blazer|vest|anorak|bomber|poncho|cape|trouser|pant|denim|jean|chino|shorts|legging|jogger|tee|t-shirt|shirt|top|tank|polo|henley|bodysuit|dress|skirt|suit|romper|overall|knitwear|fleece|tracksuit|windbreaker|shell|puffer|down jacket|parka|apparel|outerwear|intimates)\b/.test(
      blob,
    )
  )
    return true;
  return false;
}

export function isCatalogAccessory(p: CatalogProductSummary): boolean {
  if (p.variantSizePreset === "accessory") return true;
  const blob = `${p.title} ${p.category ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase();
  if (
    /\b(watch|watches|cap|hat|beanie|bag|tote|backpack|wallet|belt|sunglass|glove|sock|scarf|keychain|pin|jewelry|necklace|ring\b|earring|headwear|strap)\b/.test(
      blob,
    )
  )
    return true;
  return false;
}

function isDesignerHomeProduct(p: CatalogProductSummary): boolean {
  if (p.homeRails?.includes("featured-designer")) return true;
  const tags = (p.tags ?? []).join(" ").toLowerCase();
  if (/\bdesigner\b|avant-garde/.test(tags)) return true;
  const b = (p.brand ?? "").toLowerCase();
  if (
    /rick owens|maison margiela|margiela|guidi|boris bidjan|ann demeulemeester|acronym|undercover|yohji|raf simons|haider ackermann|julius|visvim|comme des|balenciaga|stone island|dries van noten|jil sander|raf\b/.test(
      b,
    )
  )
    return true;
  return false;
}

/** Higher score surfaces first on home (Jordan / Nike / key collabs, then Yeezy, UGG, Balenciaga, etc.). */
export function homeBrandPriorityScore(p: CatalogProductSummary): number {
  const brand = (p.brand ?? "").toLowerCase();
  const title = (p.title ?? "").toLowerCase();
  const blob = `${brand} ${title}`;
  let s = 0;
  if (brand.includes("jordan") || /\bjordan\b/.test(title)) s += 220;
  if (/\bnike\b/.test(brand)) s += 220;
  if (/travis scott|\bx\s*travis|fragment|off-white|off white|sacai|fear of god|union\s*la|\bdior\b|kaws|supreme|undefeated|atmos|concepts\b/.test(blob)) s += 160;
  if (/yeezy/.test(blob)) s += 130;
  if (/\bugg\b/.test(brand) || /\bugg\b/.test(title)) s += 130;
  if (/balenciaga/.test(blob)) s += 130;
  if (/\badidas\b/.test(brand) && !/yeezy/.test(blob)) s += 25;
  return s;
}

export function sortHomeProducts(products: CatalogProductSummary[]): CatalogProductSummary[] {
  return [...products].sort((a, b) => {
    const ia = hasCatalogFeaturedImage(a) ? 1 : 0;
    const ib = hasCatalogFeaturedImage(b) ? 1 : 0;
    if (ib !== ia) return ib - ia;
    const pb = homeBrandPriorityScore(b) - homeBrandPriorityScore(a);
    if (pb !== 0) return pb;
    const tr = (b.trendScore ?? 0) - (a.trendScore ?? 0);
    if (tr !== 0) return tr;
    return a.title.localeCompare(b.title);
  });
}

function heuristicRails(p: CatalogProductSummary): string[] {
  const rails: string[] = [];
  const title = `${p.title} ${p.productType ?? ""}`.toLowerCase();
  const tags = (p.tags ?? []).join(" ").toLowerCase();
  const blob = `${title} ${tags}`;
  if (/\bsneaker|shoe|runner|trainer|footwear|cleat|boot\b/.test(blob)) rails.push("trending-sneakers");
  if (isCatalogApparel(p) || /\bjacket|hoodie|tee|apparel|shorts|jersey|top|tank|singlet\b/.test(blob))
    rails.push("featured-apparel");
  if (/\bdesigner|avant-garde|margiela|rick owens|guidi|bbs\b/.test(blob)) rails.push("featured-designer");
  if (/\bwatch|cap|hat|bag|tote|accessor/.test(blob)) rails.push("featured-accessories");
  if (/\bsale|deal|clearance|below|discount\b/.test(blob)) rails.push("below-retail");
  rails.push("popular-local");
  return [...new Set(rails)];
}

function heuristicActivities(p: CatalogProductSummary): string[] {
  const blob = `${p.title} ${(p.tags ?? []).join(" ")}`.toLowerCase();
  const out: string[] = [];
  if (/\bsoccer|pitch|cleat\b/.test(blob)) out.push("soccer");
  if (/\bfootball|gridiron|nfl\b/.test(blob)) out.push("football");
  if (/\bbasketball|court|hoops\b/.test(blob)) out.push("basketball");
  if (/\brunning|marathon|track\b/.test(blob)) out.push("running");
  if (/\bgym|training|crossfit|workout\b/.test(blob)) out.push("training");
  if (/\btennis\b/.test(blob)) out.push("tennis");
  return [...new Set(out)];
}

/** Strip impossible rail tags (e.g. sneakers marked as apparel from bad imports). */
function sanitizeHomeRails(p: CatalogProductSummary, rails: string[]): string[] {
  let r = [...rails];
  if (isCatalogFootwear(p)) r = r.filter((x) => x !== "featured-apparel");
  if (isCatalogApparel(p)) r = r.filter((x) => x !== "trending-sneakers");
  if (isCatalogAccessory(p) && !isCatalogFootwear(p)) {
    r = r.filter((x) => x !== "trending-sneakers" && x !== "featured-apparel");
  }
  return [...new Set(r)];
}

/** Attach `homeRails` / `activities` from tags or light heuristics (DB + local seed). */
export function enrichProductsForHome(products: CatalogProductSummary[]): CatalogProductSummary[] {
  return products.map((p) => {
    const fromTags = parseTagsForHome(p.tags ?? []);
    const rawRails =
      p.homeRails?.length ? p.homeRails : fromTags.rails.length ? fromTags.rails : heuristicRails(p);
    const rails = sanitizeHomeRails(p, rawRails);
    const activities =
      p.activities?.length ? p.activities : fromTags.activities.length ? fromTags.activities : heuristicActivities(p);
    return { ...p, homeRails: rails, activities };
  });
}

function daySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function excludeSet(handles: string[]): Set<string> {
  return new Set(handles);
}

export function pickRecommended(products: CatalogProductSummary[], excludeHandles: string[], limit: number): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const pool = products.filter((p) => !ex.has(p.handle));
  return sortHomeProducts(pool).slice(0, limit);
}

/** Footwear only; prefers items tagged `trending-sneakers`, then brand-priority sort. */
export function pickTrendingSneakers(
  products: CatalogProductSummary[],
  limit: number,
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const footwear = products.filter((p) => isCatalogFootwear(p) && !ex.has(p.handle));
  const tagged = footwear.filter((p) => (p.homeRails ?? []).includes("trending-sneakers"));
  const taggedSet = new Set(tagged.map((p) => p.handle));
  const rest = footwear.filter((p) => !taggedSet.has(p.handle));
  return sortHomeProducts([...tagged, ...rest]).slice(0, limit);
}

/** True apparel only — never backfilled with shoes. */
export function pickFeaturedApparel(
  products: CatalogProductSummary[],
  limit: number,
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const apparel = products.filter((p) => isCatalogApparel(p) && !ex.has(p.handle));
  const tagged = apparel.filter((p) => (p.homeRails ?? []).includes("featured-apparel"));
  const taggedSet = new Set(tagged.map((p) => p.handle));
  const rest = apparel.filter((p) => !taggedSet.has(p.handle));
  return sortHomeProducts([...tagged, ...rest]).slice(0, limit);
}

/** Designer / avant-garde rail — strict pool; no unrelated fill. */
export function pickFeaturedDesignerRail(
  products: CatalogProductSummary[],
  limit: number,
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const pool = products.filter((p) => isDesignerHomeProduct(p) && !ex.has(p.handle));
  const tagged = pool.filter((p) => (p.homeRails ?? []).includes("featured-designer"));
  const taggedSet = new Set(tagged.map((p) => p.handle));
  const rest = pool.filter((p) => !taggedSet.has(p.handle));
  return sortHomeProducts([...tagged, ...rest]).slice(0, limit);
}

function qualifiesFeaturedAccessory(p: CatalogProductSummary): boolean {
  if (isCatalogFootwear(p)) return false;
  if (isCatalogAccessory(p)) return true;
  return (p.homeRails ?? []).includes("featured-accessories");
}

/** Bags, hats, watches, etc. — not shoes or clothing. */
export function pickFeaturedAccessoriesRail(
  products: CatalogProductSummary[],
  limit: number,
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const pool = products.filter((p) => qualifiesFeaturedAccessory(p) && !isCatalogApparel(p) && !ex.has(p.handle));
  const tagged = pool.filter((p) => (p.homeRails ?? []).includes("featured-accessories"));
  const taggedSet = new Set(tagged.map((p) => p.handle));
  const rest = pool.filter((p) => !taggedSet.has(p.handle));
  return sortHomeProducts([...tagged, ...rest]).slice(0, limit);
}

export function pickByRail(
  products: CatalogProductSummary[],
  rail: HomeRailSlug,
  limit: number,
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const hit = products.filter((p) => (p.homeRails ?? []).includes(rail) && !ex.has(p.handle));
  const fill = shuffle(
    products.filter((p) => !ex.has(p.handle) && !hit.some((h) => h.handle === p.handle)),
    daySeed() + rail.length,
  );
  return sortHomeProducts([...hit, ...fill]).slice(0, limit);
}

export function pickByActivity(products: CatalogProductSummary[], activitySlug: string, limit: number): CatalogProductSummary[] {
  const hit = products.filter((p) => (p.activities ?? []).includes(activitySlug));
  return hit.slice(0, limit);
}

export function resolveRecentProducts(all: CatalogProductSummary[], recent: { handle: string }[]): CatalogProductSummary[] {
  const map = new Map(all.map((p) => [p.handle, p]));
  const out: CatalogProductSummary[] = [];
  for (const r of recent) {
    const p = map.get(r.handle);
    if (p) out.push(p);
  }
  return out.slice(0, 12);
}

export function pickNewAtExch(products: CatalogProductSummary[], limit: number): CatalogProductSummary[] {
  const tagged = products.filter((p) => (p.homeRails ?? []).includes("new-at-exch"));
  const rest = products.filter((p) => !tagged.includes(p));
  return [...sortHomeProducts(tagged), ...sortHomeProducts(rest)].slice(0, limit);
}
