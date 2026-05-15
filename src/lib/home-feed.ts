import type { CatalogProductSummary } from "@/lib/catalog-product";

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

function heuristicRails(p: CatalogProductSummary): string[] {
  const rails: string[] = [];
  const title = `${p.title} ${p.productType ?? ""}`.toLowerCase();
  const tags = (p.tags ?? []).join(" ").toLowerCase();
  const blob = `${title} ${tags}`;
  if (/\bsneaker|shoe|runner|trainer|footwear|cleat|boot\b/.test(blob)) rails.push("trending-sneakers");
  if (/\bjacket|hoodie|tee|apparel|shorts|jersey|top|tank|singlet\b/.test(blob)) rails.push("featured-apparel");
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

/** Attach `homeRails` / `activities` from tags or light heuristics (DB + local seed). */
export function enrichProductsForHome(products: CatalogProductSummary[]): CatalogProductSummary[] {
  return products.map((p) => {
    const fromTags = parseTagsForHome(p.tags ?? []);
    const rails =
      p.homeRails?.length ? p.homeRails : fromTags.rails.length ? fromTags.rails : heuristicRails(p);
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
  return shuffle(pool, daySeed() + 7).slice(0, limit);
}

export function pickByRail(
  products: CatalogProductSummary[],
  rail: HomeRailSlug,
  limit: number,
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const hit = products.filter((p) => (p.homeRails ?? []).includes(rail) && !ex.has(p.handle));
  if (hit.length >= limit) return hit.slice(0, limit);
  const fill = shuffle(
    products.filter((p) => !ex.has(p.handle) && !hit.some((h) => h.handle === p.handle)),
    daySeed() + rail.length,
  );
  return [...hit, ...fill].slice(0, limit);
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
  return [...tagged, ...shuffle(rest, daySeed() + 401)].slice(0, limit);
}
