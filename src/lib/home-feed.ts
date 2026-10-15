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
  | "new-at-vrna";

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

/** Clothing layers — never includes footwear/sneakers or accessories. */
export function isCatalogApparel(p: CatalogProductSummary): boolean {
  if (isCatalogFootwear(p)) return false;
  if (p.variantSizePreset === "accessory" || isCatalogAccessory(p)) return false;
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
    /\b(watch|watches|cap|hat|beanie|bag|tote|backpack|duffle|duffel|sling|crossbody|messenger|satchel|wallet|belt|sunglasses?|eyewear|glasses|bandeau|glove|sock|scarf|keychain|pin|jewelry|necklace|ring\b|earring|headwear|strap)\b/.test(
      blob,
    )
  )
    return true;
  return false;
}

/** Bags, hats, watches, and dept-accessories rows (KicksDB uses dept-men + kind accessory). */
export function isCatalogAccessoryCandidate(p: CatalogProductSummary): boolean {
  const title = p.title.toLowerCase();
  const tags = (p.tags ?? []).map((t) => t.toLowerCase());
  if (/\bcap and gown\b/.test(title)) return false;
  if (tags.includes("sneakers") && (p.productType ?? "").toLowerCase() === "accessory") return false;
  if (isCatalogFootwear(p)) return false;
  if ((p.productType ?? "").toLowerCase() === "accessory") return true;
  if (p.departmentSlug === "accessories") return true;
  if (isCatalogAccessory(p)) return true;
  if ((p.homeRails ?? []).includes("featured-accessories")) return true;
  if (tags.some((t) => t === "accessory" || t === "dept-accessories" || t.startsWith("home-featured-accessories")))
    return true;
  return false;
}

export type CatalogAudience = "men" | "women" | "kids" | "unisex";

/** Title wins over a stored gender, so a women's shoe tagged as men's stays women's. */
export function catalogAudience(p: CatalogProductSummary): CatalogAudience {
  const title = (p.title ?? "").toLowerCase();
  const tags = (p.tags ?? []).map((tag) => tag.toLowerCase());
  const gender = (p.gender ?? "").toLowerCase();
  const dept = (p.departmentSlug ?? "").toLowerCase();
  const titleWomen = /\b(women'?s|womens|wmns|ladies)\b/.test(title) || /\(\s*w\s*\)/.test(title);
  const titleMen = /\b(men'?s|mens)\b/.test(title);
  const titleKids =
    /\b(kids|youth|toddler|preschool|grade school|infant|girls?|boys)\b/.test(title) ||
    /\bgs\b/.test(title) ||
    /\(\s*(gs|ps|td)\s*\)/.test(title);

  if (titleWomen && !titleMen) return "women";
  if (titleKids) return "kids";
  if (titleMen && !titleWomen) return "men";

  // Stored gender beats a department slug that was inferred from mixed tags.
  if (gender === "women" || gender === "men" || gender === "kids") return gender;

  const tagWomen = tags.includes("dept-women");
  const tagMen = tags.includes("dept-men");
  const tagKids = tags.includes("dept-kids");
  const tagged = [tagWomen, tagMen, tagKids].filter(Boolean).length;
  if (tagged > 1) return "unisex";
  if (tagWomen) return "women";
  if (tagMen) return "men";
  if (tagKids) return "kids";
  if (dept === "women" || dept === "men" || dept === "kids") return dept;
  return "unisex";
}

export function isCatalogCollectible(p: CatalogProductSummary): boolean {
  const blob = `${p.title} ${p.category ?? ""} ${p.productType ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase();
  return /\b(bearbrick|be@rbrick|collectible|collectable|art toy|kaws|funko|lego|statue|figurine|sculpture|designer toy)\b/.test(blob);
}

/** Home rows: men's and unisex sneakers or apparel, plus unisex accessories and collectibles. */
export function isHomePageProduct(p: CatalogProductSummary): boolean {
  const audience = catalogAudience(p);
  const dept = (p.departmentSlug ?? "").toLowerCase();
  if (audience === "women" || audience === "kids" || dept === "women" || dept === "kids") return false;
  if (isCatalogFootwear(p)) return true;
  if (isCatalogApparel(p) && !isCatalogAccessoryCandidate(p)) return true;
  if (audience !== "unisex") return false;
  return isCatalogCollectible(p) || isCatalogAccessoryCandidate(p);
}

/** Designer / street-luxury brands eligible for the home designer rail (brand field). */
const DESIGNER_BRAND_RE =
  /rick owens|maison margiela|margiela|mm6|guidi|boris bidjan|ann demeulemeester|acronym|undercover|yohji|raf simons|haider ackermann|julius|visvim|comme des|cdg|balenciaga|stone island|dries van noten|jil sander|\braf\b|amiri|gallery dept|a bathing ape|\bbape\b|off[- ]?white|fear of god|fog essentials|sp5der|spider worldwide|\bdior\b|christian dior|\bprada\b|\bfendi\b|bottega|louis vuitton|\bgucci\b|moncler|chrome hearts|needles|kapital|sacai|neighborhood|wtaps|human made|cactus plant|cpfm|palace|kith|denim tears|corteiz|rhude/;

/** Collab / house names in title when brand is Nike, Salomon, etc. */
const DESIGNER_COLLAB_RE =
  /rick owens|maison margiela|\bmm6\b|\bmargiela\b|comme des garcons|\bcdg\b|junya watanabe|balenciaga|stone island|off-white|\boff white x\b|\bx off[- ]?white\b|virgil abloh|amiri|gallery dept|a bathing ape|\bbape\b|fear of god|\bfog\b essentials|sp5der|spider worldwide|\bdior\b|sacai|acronym|undercover|yohji|raf simons|chrome hearts|cactus plant|denim tears|travis scott fragment/;

export function isDesignerHomeProduct(p: CatalogProductSummary): boolean {
  // Footwear & apparel rail — bags/hats belong on Accessories, not here.
  if (isCatalogAccessoryCandidate(p)) return false;
  const brand = (p.brand ?? "").toLowerCase();
  // Keep ALD off this rail (busy patches / lifestyle merch).
  if (/aime\s*leon|aim[eé]\s*leon/.test(brand)) return false;

  if (p.homeRails?.includes("featured-designer")) return true;
  const tags = (p.tags ?? []).join(" ").toLowerCase();
  if (/\bdesigner\b|avant-garde|featured-designer|home-featured-designer/.test(tags)) return true;
  if (DESIGNER_BRAND_RE.test(brand)) return true;
  const title = (p.title ?? "").toLowerCase();
  // Title collabs (brand may be Nike / Salomon / Moncler / etc.)
  if (DESIGNER_COLLAB_RE.test(`${brand} ${title}`)) return true;
  return false;
}

/** Higher score = earlier on home rails (after “has image”). Tuned for lifestyle / priority brands vs. generic performance runners. */
export function homeBrandPriorityScore(p: CatalogProductSummary): number {
  const brand = (p.brand ?? "").toLowerCase();
  const title = (p.title ?? "").toLowerCase();
  const tags = (p.tags ?? []).join(" ").toLowerCase();
  const blob = `${brand} ${title} ${tags}`;
  const apparel = isCatalogApparel(p);

  let s = 0;

  // Tier 1 — basketball / lifestyle anchors
  if (brand.includes("jordan") || /\bjordan\b/.test(title)) s += 260;
  if (/\bnike\b/.test(brand)) s += 260;

  // Tier 1b — headline collabs & partners (title/brand/tags)
  if (
    /travis scott|\bx\s*travis|fragment|off-white|off white|sacai|\bdior\b|kaws|supreme|union\s*la|undefeated|atmos|concepts|stussy|comme des garcons|cdg|ambush|clot|social status|a ma maniere|levis|levi's|tiffany|strange.?love|grateful dead|union jordan/.test(
      blob,
    )
  ) {
    s += 200;
  }

  // Tier 2 — requested lifestyle / street footwear & luxury
  if (/yeezy/.test(blob)) s += 210;
  if (/\bnew balance\b/.test(brand) || /\bnew balance\b/.test(title)) s += 205;
  if (/\basics\b/.test(brand) || /\basics\b/.test(title) || /\basics\b/.test(tags)) s += 200;
  if (/\bugg\b/.test(brand) || /\bugg\b/.test(title)) s += 200;
  if (/timberland|\btimbs\b|6-?inch boot|6\" boot/.test(blob)) s += 200;
  if (/balenciaga/.test(blob)) s += 210;

  // Tier 3 — apparel / street labels (extra when product is apparel)
  const streetApparel =
    /fear of god|\bessentials\b|bape|bathing ape|gallery dept|gallery department|sp5der|\bspider\b|carhartt|carhartt wip|tracksuit|track suit|track jacket|sweatsuit|chrome hearts|denim tears|palace|rhude|amiri|corteiz|aime leon dore|aime leon|bape sta|stussy|kith|nocta|tech fleece|nike hoodie|jordan hoodie|bape hoodie|supreme box|box logo/.test(
      blob,
    );
  if (apparel && streetApparel) s += 185;
  else if (streetApparel) s += 95;

  // Adidas lifestyle (non-Yeezy) — above anonymous imports, below priority list
  if (/\badidas\b/.test(brand) && !/yeezy/.test(blob)) s += 45;

  // Light penalty: obvious marathon / race silhouettes (still shown, but after Jordans etc.)
  if (isCatalogFootwear(p)) {
    if (
      /\badizero|takumi sen|takumi|vaporfly|alphafly|metaspeed|adios pro|fuelcell supercomp|endorphin pro|endorphin elite|zoomx streakfly|streakfly|marathon elite|pro\s*3\s*running|racing flat\b/.test(
        blob,
      )
    ) {
      s -= 120;
    }
    // Soccer / football / tennis cleats & court — slightly below lifestyle sneakers for home trending
    if (/\b(copa|predator|phantom|mercurial|tiempo|nemeziz|vapor edge|alpha menace|barricade|gel.?resolution|phantom gx|fg\b|mg\b|sg\b|cleat)\b/.test(blob)) {
      s -= 55;
    }
  }

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

/** Apparel rails: lift street labels so the row is not six generic Nike hoodies. */
export function homeApparelPriorityScore(p: CatalogProductSummary): number {
  let s = homeBrandPriorityScore(p);
  const brand = (p.brand ?? "").toLowerCase();
  const blob = `${brand} ${p.title ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase();

  const isNikeCollab = /\bnike\b/.test(brand) && /travis|off-?white|sacai|stussy|nocta|supreme|cdg|comme des|dior|kaws|union|ambush|clot|levis|tiffany/.test(blob);
  if (/\bnike\b/.test(brand) && !isNikeCollab) s -= 90;

  if (
    /denim tears|sp5der|\bspider\b|stussy|fear of god|\bessentials\b|bape|supreme|palace|corteiz|kith|chrome hearts|rhude|amiri|gallery dept|carhartt|tracksuit|tech fleece|bape sta|nocta|yeezy|balenciaga|stone island|rick owens|margiela|guidi|acronym|undercover|yohji|raf simons|comme des|gallery department/.test(
      blob,
    )
  ) {
    s += 130;
  }
  return s;
}

export function sortHomeApparelProducts(products: CatalogProductSummary[]): CatalogProductSummary[] {
  return [...products].sort((a, b) => {
    const ia = hasCatalogFeaturedImage(a) ? 1 : 0;
    const ib = hasCatalogFeaturedImage(b) ? 1 : 0;
    if (ib !== ia) return ib - ia;
    const pb = homeApparelPriorityScore(b) - homeApparelPriorityScore(a);
    if (pb !== 0) return pb;
    const tr = (b.trendScore ?? 0) - (a.trendScore ?? 0);
    if (tr !== 0) return tr;
    return a.title.localeCompare(b.title);
  });
}

function brandKey(p: CatalogProductSummary): string {
  const b = p.brand?.trim();
  if (!b) return "_unknown";
  return b
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Collapse color/size noise so one jacket in six colors does not fill a rail. */
function titleFingerprint(p: CatalogProductSummary): string {
  const base = (p.title ?? p.handle)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(
      /\b(black|white|navy|grey|gray|red|blue|green|brown|cream|fossil|cement|beige|pink|purple|orange|yellow|olive|tan|burgundy|maroon|silver|gold|multicolor|cotton|nylon|wool|leather|canvas|suede|silk|men'?s|women'?s|womens|kids|youth|asia sizing)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return base.split(/\s+/).slice(0, 8).join(" ");
}

/**
 * From a score-sorted pool, pick `limit` items with brand + silhouette variety
 * (max one per brand per round; max one per title fingerprint).
 */
export function pickDiverseHomeProducts(sortedPool: CatalogProductSummary[], limit: number): CatalogProductSummary[] {
  if (limit <= 0 || !sortedPool.length) return [];

  const byBrand = new Map<string, CatalogProductSummary[]>();
  for (const p of sortedPool) {
    const key = brandKey(p);
    const list = byBrand.get(key) ?? [];
    list.push(p);
    byBrand.set(key, list);
  }

  const brandOrder = [...byBrand.keys()].sort((a, b) => {
    const ia = sortedPool.findIndex((p) => brandKey(p) === a);
    const ib = sortedPool.findIndex((p) => brandKey(p) === b);
    return ia - ib;
  });

  const out: CatalogProductSummary[] = [];
  const usedHandles = new Set<string>();
  const usedPrints = new Set<string>();
  const brandRoundIndex = new Map<string, number>();

  while (out.length < limit) {
    let added = false;
    for (const bk of brandOrder) {
      if (out.length >= limit) break;
      const items = byBrand.get(bk) ?? [];
      const idx = brandRoundIndex.get(bk) ?? 0;
      if (idx >= items.length) continue;

      let picked: CatalogProductSummary | null = null;
      for (let i = idx; i < items.length; i++) {
        const candidate = items[i]!;
        if (usedHandles.has(candidate.handle)) continue;
        const fp = `${bk}|${titleFingerprint(candidate)}`;
        if (usedPrints.has(fp)) continue;
        picked = candidate;
        brandRoundIndex.set(bk, i + 1);
        break;
      }
      if (!picked) {
        brandRoundIndex.set(bk, items.length);
        continue;
      }

      out.push(picked);
      usedHandles.add(picked.handle);
      usedPrints.add(`${bk}|${titleFingerprint(picked)}`);
      added = true;
    }
    if (!added) break;
  }

  if (out.length < limit) {
    for (const p of sortedPool) {
      if (out.length >= limit) break;
      if (usedHandles.has(p.handle)) continue;
      out.push(p);
      usedHandles.add(p.handle);
    }
  }

  return out;
}

function pickFromSortedPool(
  sorted: CatalogProductSummary[],
  limit: number,
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const pool = sorted.filter((p) => !ex.has(p.handle));
  return pickDiverseHomeProducts(pool, limit);
}

function heuristicRails(p: CatalogProductSummary): string[] {
  const rails: string[] = [];
  const title = `${p.title} ${p.productType ?? ""}`.toLowerCase();
  const tags = (p.tags ?? []).join(" ").toLowerCase();
  const blob = `${title} ${tags}`;
  if (/\bsneaker|shoe|runner|trainer|footwear|cleat|boot\b/.test(blob)) rails.push("trending-sneakers");
  if (isCatalogApparel(p) || /\bjacket|hoodie|tee|apparel|shorts|jersey|top|tank|singlet\b/.test(blob))
    rails.push("featured-apparel");
  if (isDesignerHomeProduct(p) || /\bdesigner|avant-garde|featured-designer\b/.test(blob)) {
    rails.push("featured-designer");
  }
  if (/\bwatch|cap|hat|bag|tote|accessor/.test(blob)) rails.push("featured-accessories");
  if (/\bsale|deal|clearance|below|discount\b/.test(blob)) rails.push("below-retail");
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

export type TasteSeed = { handle: string; weight: number };

const TASTE_STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "mens",
  "men",
  "womens",
  "women",
  "womans",
  "kids",
  "youth",
  "retro",
  "high",
  "low",
  "mid",
  "og",
  "sp",
  "gs",
  "shoe",
  "shoes",
  "size",
]);

function bump(map: Map<string, number>, key: string, weight: number) {
  const k = key.trim().toLowerCase();
  if (!k || k === "_unknown" || weight <= 0) return;
  map.set(k, (map.get(k) ?? 0) + weight);
}

function tasteTokens(p: CatalogProductSummary): string[] {
  return `${p.brand ?? ""} ${p.title} ${p.productType ?? ""}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !TASTE_STOP.has(token));
}

export type RecommendedRail = {
  ranked: CatalogProductSummary[];
  taste: ReadonlyMap<string, number>;
  personalized: boolean;
};

/**
 * Rank a diverse pool from the viewer's taste (saves, bids, and recent views).
 * With no history, fall back to the usual home order.
 */
export function rankRecommendedProducts(
  products: CatalogProductSummary[],
  seeds: TasteSeed[],
  excludeHandles: string[] = [],
): RecommendedRail {
  const ex = excludeSet([...excludeHandles, ...seeds.map((seed) => seed.handle)]);
  const byHandle = new Map(products.map((p) => [p.handle, p]));
  const brands = new Map<string, number>();
  const departments = new Map<string, number>();
  const types = new Map<string, number>();
  const activities = new Map<string, number>();
  const tokens = new Map<string, number>();
  let seedWeight = 0;

  for (const seed of seeds) {
    const product = byHandle.get(seed.handle);
    if (!product || seed.weight <= 0) continue;
    seedWeight += seed.weight;
    bump(brands, brandKey(product), seed.weight);
    bump(departments, product.departmentSlug ?? "", seed.weight);
    bump(types, product.productType ?? "", seed.weight);
    for (const activity of product.activities ?? []) bump(activities, activity, seed.weight);
    for (const token of tasteTokens(product)) bump(tokens, token, seed.weight);
  }

  const personalized = seedWeight > 0;
  const scoreOf = (product: CatalogProductSummary) => {
    if (!personalized) return 0;
    let score = brands.get(brandKey(product)) ?? 0;
    score += (departments.get((product.departmentSlug ?? "").toLowerCase()) ?? 0) * 0.4;
    score += (types.get((product.productType ?? "").toLowerCase()) ?? 0) * 0.35;
    for (const activity of product.activities ?? []) score += (activities.get(activity) ?? 0) * 0.25;
    let tokenScore = 0;
    for (const token of tasteTokens(product)) tokenScore += tokens.get(token) ?? 0;
    score += Math.min(tokenScore, 8);
    if (!hasCatalogFeaturedImage(product)) score -= 2;
    return score;
  };

  const pool = products.filter((p) => !ex.has(p.handle));
  const sorted = [...pool].sort((a, b) => {
    const taste = scoreOf(b) - scoreOf(a);
    if (taste !== 0) return taste;
    const image = (hasCatalogFeaturedImage(b) ? 1 : 0) - (hasCatalogFeaturedImage(a) ? 1 : 0);
    if (image !== 0) return image;
    const brand = homeBrandPriorityScore(b) - homeBrandPriorityScore(a);
    if (brand !== 0) return brand;
    const trend = (b.trendScore ?? 0) - (a.trendScore ?? 0);
    if (trend !== 0) return trend;
    return a.title.localeCompare(b.title);
  });
  const ranked = pickDiverseHomeProducts(sorted, 24);
  const taste = new Map<string, number>();
  if (personalized) {
    for (const product of ranked) {
      const score = scoreOf(product);
      if (score > 0) taste.set(product.handle, score);
    }
  }
  return { ranked, taste, personalized };
}

export function pickRecommended(
  products: CatalogProductSummary[],
  excludeHandles: string[],
  limit: number,
  seeds: TasteSeed[] = [],
): CatalogProductSummary[] {
  const rail = rankRecommendedProducts(products, seeds, excludeHandles);
  return designerRailWindow(rail.ranked, rail.taste, 0, limit);
}

/** One new recommended set every two local days. */
export function recommendedRotationStep(now = new Date()): number {
  const dayIndex = now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate();
  return Math.floor(dayIndex / 2);
}

export function msUntilNextRecommendedSlot(now = new Date()): number {
  const dayIndex = now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate();
  const daysLeft = dayIndex % 2 === 0 ? 2 : 1;
  const next = new Date(now);
  next.setDate(next.getDate() + daysLeft);
  next.setHours(0, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

/** Footwear only; prefers items tagged `trending-sneakers`, then brand-priority sort. */
export function rankTrendingSneakers(
  products: CatalogProductSummary[],
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const footwear = products.filter((p) => isCatalogFootwear(p) && !ex.has(p.handle));
  const tagged = footwear.filter((p) => (p.homeRails ?? []).includes("trending-sneakers"));
  const taggedSet = new Set(tagged.map((p) => p.handle));
  const rest = footwear.filter((p) => !taggedSet.has(p.handle));
  return pickDiverseHomeProducts(sortHomeProducts([...tagged, ...rest]), 42);
}

export function pickTrendingSneakers(
  products: CatalogProductSummary[],
  limit: number,
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  return designerRailWindow(rankTrendingSneakers(products, excludeHandles), new Map(), 0, limit);
}

/** One new trending set every 7 local days. */
export function trendingRotationStep(now = new Date()): number {
  const dayIndex = now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate();
  return Math.floor(dayIndex / 7);
}

export function msUntilNextTrendingSlot(now = new Date()): number {
  const dayIndex = now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate();
  const next = new Date(now);
  next.setDate(next.getDate() + (7 - (dayIndex % 7)));
  next.setHours(0, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

function isFeaturedJacket(p: CatalogProductSummary): boolean {
  if (designerFocusKind(p) !== "jacket" || isCatalogAccessoryCandidate(p)) return false;
  const blob = `${p.title ?? ""} ${p.category ?? ""}`.toLowerCase();
  if (/\bvest\b/.test(blob) && !/\b(jacket|coat|parka|bomber|puffer)\b/.test(blob)) return false;
  return true;
}

function jacketBrandBucket(p: CatalogProductSummary): "northface" | "moncler" | "stussy" | "other" {
  const blob = `${p.brand ?? ""} ${p.title ?? ""}`.toLowerCase();
  if (/moncler/.test(blob)) return "moncler";
  if (/stussy|stüssy/.test(blob)) return "stussy";
  if (/the north face|north face/.test(blob)) return "northface";
  return "other";
}

/** Jackets only. Every set keeps a North Face, Moncler, and Stussy jacket when the catalog has them. */
export function rankFeaturedApparel(
  products: CatalogProductSummary[],
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const jackets = products.filter((p) => isFeaturedJacket(p) && !ex.has(p.handle));
  const buckets = {
    northface: [] as CatalogProductSummary[],
    moncler: [] as CatalogProductSummary[],
    stussy: [] as CatalogProductSummary[],
    other: [] as CatalogProductSummary[],
  };
  for (const jacket of jackets) buckets[jacketBrandBucket(jacket)].push(jacket);
  const northface = pickDiverseHomeProducts(sortHomeApparelProducts(buckets.northface), 8);
  const moncler = pickDiverseHomeProducts(sortHomeApparelProducts(buckets.moncler), 8);
  const stussy = pickDiverseHomeProducts(sortHomeApparelProducts(buckets.stussy), 8);
  const other = pickDiverseHomeProducts(sortHomeApparelProducts(buckets.other), 24);
  const cursors = { northface: 0, moncler: 0, stussy: 0, other: 0 };
  const lists = { northface, moncler, stussy, other };
  const take = (key: keyof typeof lists) => {
    const item = lists[key][cursors[key]];
    if (!item) return null;
    cursors[key] += 1;
    return item;
  };
  const out: CatalogProductSummary[] = [];
  while (out.length + 6 <= 42) {
    const block: CatalogProductSummary[] = [];
    for (const key of ["northface", "moncler", "stussy"] as const) {
      const item = take(key);
      if (item) block.push(item);
    }
    while (block.length < 6) {
      const item = take("other") ?? take("northface") ?? take("moncler") ?? take("stussy");
      if (!item) break;
      block.push(item);
    }
    if (block.length < 6) break;
    out.push(...block);
  }
  if (out.length >= 6) return out;
  return pickDiverseHomeProducts(sortHomeApparelProducts(jackets), 42);
}

export function pickFeaturedApparel(
  products: CatalogProductSummary[],
  limit: number,
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  return designerRailWindow(rankFeaturedApparel(products, excludeHandles), new Map(), 0, limit);
}

/** One new apparel set at local midnight. */
export function apparelRotationStep(now = new Date()): number {
  return now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate();
}

export function msUntilNextApparelSlot(now = new Date()): number {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

/**
 * Each six keeps a mix of jackets, pants, and shoes.
 * Wanted pieces stay in their own slot; the rest of that slot rotates.
 */
export function windowDesignerFocus(
  ranked: CatalogProductSummary[],
  demand: ReadonlyMap<string, number> = new Map(),
  step = 0,
  limit = 6,
): CatalogProductSummary[] {
  const jackets = ranked.filter((p) => designerFocusKind(p) === "jacket");
  const pants = ranked.filter((p) => designerFocusKind(p) === "pants");
  const shoes = ranked.filter((p) => designerFocusKind(p) === "shoes");
  const other = ranked.filter((p) => !designerFocusKind(p));
  const safeStep = Number.isFinite(step) ? Math.max(0, Math.floor(step)) : 0;

  const rotate = (list: CatalogProductSummary[], count: number) => {
    if (!list.length || count <= 0) return [];
    const wanted = list.filter((p) => (demand.get(p.handle) ?? 0) > 0).slice(0, count);
    const pinned = new Set(wanted.map((p) => p.handle));
    const rest = list.filter((p) => !pinned.has(p.handle));
    const out = [...wanted];
    const source = rest.length ? rest : list;
    const need = count - out.length;
    if (need <= 0 || !source.length) return out.slice(0, count);
    const start = (safeStep * need) % source.length;
    for (let i = 0; i < source.length && out.length < count; i++) {
      const item = source[(start + i) % source.length]!;
      if (!pinned.has(item.handle)) out.push(item);
    }
    return out.slice(0, count);
  };

  let jacketSlots = Math.min(2, jackets.length);
  let pantSlots = Math.min(2, pants.length);
  let shoeSlots = Math.min(2, shoes.length);
  let spare = limit - (jacketSlots + pantSlots + shoeSlots);
  while (spare > 0 && jacketSlots < jackets.length) {
    jacketSlots += 1;
    spare -= 1;
  }
  while (spare > 0 && shoeSlots < shoes.length) {
    shoeSlots += 1;
    spare -= 1;
  }
  while (spare > 0 && pantSlots < pants.length) {
    pantSlots += 1;
    spare -= 1;
  }

  const mixed = interleaveProducts([
    rotate(jackets, jacketSlots),
    rotate(pants, pantSlots),
    rotate(shoes, shoeSlots),
    rotate(other, spare),
  ]);
  return mixed.slice(0, limit);
}

/** Designer / avant-garde rail — strict pool; no unrelated fill. */
export function pickFeaturedDesignerRail(
  products: CatalogProductSummary[],
  limit: number,
  excludeHandles: string[] = [],
  demand: ReadonlyMap<string, number> = new Map(),
): CatalogProductSummary[] {
  return windowDesignerFocus(rankDesignerProducts(products, demand, excludeHandles), demand, 0, limit);
}

/** Jackets, pants, or shoes. Hoodies, tees, and hats stay out of this rail. */
function designerFocusKind(p: CatalogProductSummary): "jacket" | "pants" | "shoes" | null {
  if (isCatalogFootwear(p)) return "shoes";
  const blob = `${p.title ?? ""} ${p.category ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase();
  if (/\b(jacket|coat|parka|bomber|anorak|windbreaker|puffer|trench|blazer|overcoat|nuptse)\b/.test(blob))
    return "jacket";
  if (/\b(hoodie|hooded|sweatshirt|crewneck|t-?shirt|tee|polo|jersey)\b/.test(blob)) return null;
  if (/\bvarsity\b/.test(blob)) return "jacket";
  if (/\b(pants|pant|trousers|trouser|jeans|jean|cargo|sweatpants|joggers|chinos)\b/.test(blob)) return "pants";
  return null;
}

function interleaveProducts(groups: CatalogProductSummary[][]): CatalogProductSummary[] {
  const out: CatalogProductSummary[] = [];
  const max = groups.reduce((n, group) => Math.max(n, group.length), 0);
  for (let i = 0; i < max; i++) {
    for (const group of groups) {
      const item = group[i];
      if (item) out.push(item);
    }
  }
  return out;
}

/**
 * Designer pool of jackets, pants, and shoes, most wanted first.
 * Live demand (views, saves, open bids) outranks brand priority inside each group.
 */
export function rankDesignerProducts(
  products: CatalogProductSummary[],
  demand: ReadonlyMap<string, number> = new Map(),
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const pool = products.filter((p) => isDesignerHomeProduct(p) && !ex.has(p.handle));
  const tagged = new Set(
    pool.filter((p) => (p.homeRails ?? []).includes("featured-designer")).map((p) => p.handle),
  );
  const sortPool = (list: CatalogProductSummary[]) =>
    [...list].sort((a, b) => {
      const db = (demand.get(b.handle) ?? 0) - (demand.get(a.handle) ?? 0);
      if (db !== 0) return db;
      const ib = (hasCatalogFeaturedImage(b) ? 1 : 0) - (hasCatalogFeaturedImage(a) ? 1 : 0);
      if (ib !== 0) return ib;
      const tb = (tagged.has(b.handle) ? 1 : 0) - (tagged.has(a.handle) ? 1 : 0);
      if (tb !== 0) return tb;
      const pb = homeBrandPriorityScore(b) - homeBrandPriorityScore(a);
      if (pb !== 0) return pb;
      const tr = (b.trendScore ?? 0) - (a.trendScore ?? 0);
      if (tr !== 0) return tr;
      return a.title.localeCompare(b.title);
    });

  const focus = interleaveProducts([
    pickDiverseHomeProducts(sortPool(pool.filter((p) => designerFocusKind(p) === "jacket")), 8),
    pickDiverseHomeProducts(sortPool(pool.filter((p) => designerFocusKind(p) === "pants")), 8),
    pickDiverseHomeProducts(sortPool(pool.filter((p) => designerFocusKind(p) === "shoes")), 8),
  ]);
  if (focus.length >= 6) return focus.slice(0, 24);

  const rest = pickDiverseHomeProducts(
    sortPool(pool.filter((p) => !designerFocusKind(p))),
    24 - focus.length,
  );
  return [...focus, ...rest].slice(0, 24);
}

/**
 * Six-up window over the ranked designer pool.
 * Products people want right now stay on screen; the other slots walk the rest of the pool.
 */
/** Four windows a day: 12am, 6am, 12pm, and 6pm local time. */
export function designerRotationStep(now = new Date()): number {
  const slot = Math.floor(now.getHours() / 6);
  const dayIndex = now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate();
  return dayIndex * 4 + slot;
}

export function msUntilNextDesignerSlot(now = new Date()): number {
  const next = new Date(now);
  next.setHours(Math.floor(now.getHours() / 6) * 6 + 6, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

export function designerRailWindow(
  ranked: CatalogProductSummary[],
  demand: ReadonlyMap<string, number>,
  step: number,
  limit = 6,
): CatalogProductSummary[] {
  if (ranked.length <= limit) return ranked.slice(0, limit);
  const safeStep = Number.isFinite(step) ? Math.max(0, Math.floor(step)) : 0;
  const wanted = ranked.filter((p) => (demand.get(p.handle) ?? 0) > 0).slice(0, Math.min(3, limit - 1));
  if (!wanted.length) {
    const start = (safeStep * limit) % ranked.length;
    const out: CatalogProductSummary[] = [];
    for (let i = 0; i < limit; i++) out.push(ranked[(start + i) % ranked.length]!);
    return out;
  }
  const pinned = new Set(wanted.map((p) => p.handle));
  const rest = ranked.filter((p) => !pinned.has(p.handle));
  const slots = limit - wanted.length;
  if (!rest.length) return wanted.slice(0, limit);
  const start = (safeStep * slots) % rest.length;
  const out = [...wanted];
  for (let i = 0; i < slots; i++) out.push(rest[(start + i) % rest.length]!);
  return out;
}

/** Noon and midnight, local time. */
export function twiceDailyRotationStep(now = new Date()): number {
  const slot = Math.floor(now.getHours() / 12);
  const dayIndex = now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate();
  return dayIndex * 2 + slot;
}

export function msUntilNextTwiceDailySlot(now = new Date()): number {
  const next = new Date(now);
  next.setHours(Math.floor(now.getHours() / 12) * 12 + 12, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

/** Bags, hats, watches, etc. — not shoes or clothing. */
export function rankFeaturedAccessories(
  products: CatalogProductSummary[],
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const candidates = products.filter(
    (p) =>
      (isCatalogAccessoryCandidate(p) || isCatalogCollectible(p)) &&
      !isCatalogApparel(p) &&
      !isCatalogFootwear(p) &&
      catalogAudience(p) === "unisex",
  );
  let pool = candidates.filter((p) => !ex.has(p.handle));
  if (pool.length < 6) pool = candidates;
  const tagged = pool.filter((p) => (p.homeRails ?? []).includes("featured-accessories"));
  const taggedSet = new Set(tagged.map((p) => p.handle));
  const rest = pool.filter((p) => !taggedSet.has(p.handle));
  return pickDiverseHomeProducts(sortHomeProducts([...tagged, ...rest]), 42);
}

export function pickFeaturedAccessoriesRail(
  products: CatalogProductSummary[],
  limit: number,
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  return designerRailWindow(rankFeaturedAccessories(products, excludeHandles), new Map(), 0, limit);
}

/** Below-retail tags first, then the rest of the catalog, ready for a twice-daily window. */
export function rankBelowRetail(
  products: CatalogProductSummary[],
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const hit = products.filter((p) => (p.homeRails ?? []).includes("below-retail") && !ex.has(p.handle));
  const hitHandles = new Set(hit.map((p) => p.handle));
  const fill = products.filter(
    (p) => !ex.has(p.handle) && !hitHandles.has(p.handle) && !isCatalogAccessoryCandidate(p),
  );
  return pickDiverseHomeProducts(sortHomeProducts([...hit, ...fill]), 42);
}

/**
 * Non-accessory pool, live demand first.
 * A location key picks which slice is on screen, so two areas do not share the same six.
 */
export function rankPopularLocal(
  products: CatalogProductSummary[],
  demand: ReadonlyMap<string, number> = new Map(),
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  const pool = products.filter((p) => !ex.has(p.handle) && !isCatalogAccessoryCandidate(p));
  const sorted = [...pool].sort((a, b) => {
    const wanted = (demand.get(b.handle) ?? 0) - (demand.get(a.handle) ?? 0);
    if (wanted !== 0) return wanted;
    const image = (hasCatalogFeaturedImage(b) ? 1 : 0) - (hasCatalogFeaturedImage(a) ? 1 : 0);
    if (image !== 0) return image;
    const brand = homeBrandPriorityScore(b) - homeBrandPriorityScore(a);
    if (brand !== 0) return brand;
    const trend = (b.trendScore ?? 0) - (a.trendScore ?? 0);
    if (trend !== 0) return trend;
    return a.title.localeCompare(b.title);
  });
  return pickDiverseHomeProducts(sorted, 42);
}

/** Stable window offset for a city, region, or timezone. */
export function locationWindowStep(locationKey: string): number {
  const key = locationKey.trim().toLowerCase() || "local";
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  return hash % 997;
}

export function pickByRail(
  products: CatalogProductSummary[],
  rail: HomeRailSlug,
  limit: number,
  excludeHandles: string[] = [],
): CatalogProductSummary[] {
  const ex = excludeSet(excludeHandles);
  let hit = products.filter((p) => (p.homeRails ?? []).includes(rail) && !ex.has(p.handle));
  // KicksDB import tags almost every row with popular-local — use a real pool, not the whole catalog.
  if (rail === "popular-local" && hit.length > limit * 8) {
    hit = hit.filter((p) => !isCatalogAccessoryCandidate(p));
  }
  const fill = shuffle(
    products.filter(
      (p) =>
        !ex.has(p.handle) &&
        !hit.some((h) => h.handle === p.handle) &&
        !isCatalogAccessoryCandidate(p),
    ),
    daySeed() + rail.length,
  );
  return pickFromSortedPool(sortHomeProducts([...hit, ...fill]), limit, excludeHandles);
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

function createdStamp(product: CatalogProductSummary): number {
  const stamp = product.createdAt ? Date.parse(product.createdAt) : 0;
  return Number.isFinite(stamp) ? stamp : 0;
}

/** Newest catalog arrivals. Falls back to the tagged new rail when nothing has a date. */
export function pickNewAtExch(products: CatalogProductSummary[], limit: number, excludeHandles: string[] = []): CatalogProductSummary[] {
  const hasDates = products.some((product) => createdStamp(product) > 0);
  if (!hasDates) {
    const tagged = products.filter((p) => {
      const rails = p.homeRails ?? [];
      return rails.includes("new-at-vrna") || rails.includes("new-at-exch");
    });
    const taggedHandles = new Set(tagged.map((p) => p.handle));
    const rest = products.filter((p) => !taggedHandles.has(p.handle));
    return pickFromSortedPool(sortHomeProducts([...tagged, ...rest]), limit, excludeHandles);
  }

  const byNewest = [...products].sort((a, b) => {
    const delta = createdStamp(b) - createdStamp(a);
    if (delta !== 0) return delta;
    return a.title.localeCompare(b.title);
  });
  const unseen = byNewest.filter((product) => !excludeHandles.includes(product.handle));
  const pool = unseen.length >= limit ? unseen : byNewest;
  return pickDiverseHomeProducts(pool, limit);
}
