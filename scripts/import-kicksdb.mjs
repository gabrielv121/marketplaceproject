#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { BLOCKED_CATALOG_HANDLES, isBlockedCatalogHandle } from "./lib/blocked-catalog-handles.mjs";
import { pickBestProductImageUrl } from "./lib/stockx-image.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const API_BASE = "https://api.kicks.dev/v3/stockx/products";
const DEFAULT_QUERIES = [
  "Air Jordan 1 Retro High OG",
  "Air Jordan 2 Retro",
  "Air Jordan 3 Retro",
  "Air Jordan 4 Retro",
  "Air Jordan 5 Retro",
  "Air Jordan 6 Retro",
  "Air Jordan 7 Retro",
  "Air Jordan 8 Retro",
  "Air Jordan 9 Retro",
  "Air Jordan 10 Retro",
  "Air Jordan 11 Retro",
  "Air Jordan 12 Retro",
  "Air Jordan 13 Retro",
  "Air Jordan 14 Retro",
  "New Balance 550",
  "New Balance 990",
  "New Balance 9060",
  "New Balance 2002R",
  "ASICS Gel-Kayano 14",
  "ASICS Gel-NYC",
  "ASICS Gel-Lyte III",
  "Nike Dunk Low",
  "Nike Air Force 1 Low",
  "Nike Air Max 1",
  "Nike Air Max 90",
  "Nike Kobe",
  "Adidas Samba",
  "Adidas Campus",
  "Adidas Yeezy Boost 350",
  "Adidas Yeezy Slide",
  "Converse Chuck Taylor",
  "Vans Old Skool",
  "Puma Speedcat",
  "Reebok Club C",
  "Hoka Bondi",
  "On Cloud",
  "Saucony Shadow 6000",
  "Saucony Grid",
  "Salomon XT-6",
  "Salomon ACS Pro",
  "Crocs Classic Clog",
  "Crocs Pollex Clog",
  "UGG Tasman",
  "UGG Tazz",
  "Birkenstock Boston",
  "Timberland 6-Inch Boot",
  "Nike Mercurial",
  "Nike Phantom Soccer Cleats",
  "Adidas Predator",
  "Adidas Copa Soccer Cleats",
  "Nike Vapor Edge Football Cleats",
  "Nike Alpha Menace Football Cleats",
  "Adidas Adizero Football Cleats",
  "NikeCourt Vapor",
  "NikeCourt Zoom",
  "Adidas Barricade Tennis",
  "ASICS Gel Resolution Tennis",
  "Fear of God Essentials Hoodie",
  "Supreme Box Logo Hoodie",
  "Supreme T Shirt",
  "Nike Tech Fleece",
  "Nike Hoodie",
  "Jordan Hoodie",
  "BAPE Hoodie",
  "Stussy Hoodie",
  "Denim Tears Hoodie",
  "Stone Island Jacket",
  "Chrome Hearts Hoodie",
  "Gallery Dept T-Shirt",
  "Palace Hoodie",
  "Aime Leon Dore Hoodie",
  "Aime Leon Dore New Balance",
  "Supreme Backpack",
  "Supreme Waist Bag",
  "Kith Duffle Bag",
  "Telfar Shopping Bag",
  "New Era 59Fifty Cap",
  "Nike Beanie",
  "Carhartt WIP Beanie",
  "Bape Shark Hoodie",
  "Jordan Backpack",
  "Adidas Duffle Bag",
  "G-Shock Watch",
  "Casio G-Shock",
  "Rhude Hoodie",
  "Corteiz Hoodie",
  "Sp5der Hoodie",
  "Carhartt WIP Jacket",
  "Carhartt WIP Hoodie",
  "Amiri Hoodie",
];

/** Brands under ~100 items — paginated fill toward TARGET_PER_BRAND. */
const FILL_LOW_BRANDS = [
  { brand: "Stussy", aliases: ["stussy"], queries: ["Stussy", "Stussy Hoodie", "Stussy T Shirt", "Stussy Cap"] },
  { brand: "UGG", aliases: ["ugg"], queries: ["UGG", "UGG Tasman", "UGG Tazz", "UGG Ultra Mini", "UGG Classic"] },
  { brand: "Crocs", aliases: ["crocs"], queries: ["Crocs", "Crocs Classic Clog", "Crocs Pollex", "Crocs Echo"] },
  { brand: "Gucci", aliases: ["gucci"], queries: ["Gucci", "Gucci Sneaker", "Gucci Bag", "Gucci Belt"] },
  { brand: "LEGO", aliases: ["lego"], queries: ["LEGO", "LEGO Set", "LEGO Technic", "LEGO Speed Champions"] },
  { brand: "Salomon", aliases: ["salomon"], queries: ["Salomon", "Salomon XT-6", "Salomon ACS Pro", "Salomon XT-4"] },
  {
    brand: "The North Face",
    aliases: ["thenorthface", "northface"],
    queries: ["The North Face", "North Face Nuptse", "North Face Jacket", "North Face Hoodie"],
  },
  { brand: "Saucony", aliases: ["saucony"], queries: ["Saucony", "Saucony Shadow", "Saucony Grid", "Saucony Endorphin"] },
  { brand: "Bearbrick", aliases: ["bearbrick", "medicom"], queries: ["Bearbrick", "BE@RBRICK"] },
  { brand: "Moncler", aliases: ["moncler"], queries: ["Moncler", "Moncler Jacket", "Moncler Maya", "Moncler Genius"] },
  {
    brand: "Bottega Veneta",
    aliases: ["bottegaveneta", "bottega"],
    queries: ["Bottega Veneta", "Bottega Veneta Bag", "Bottega Sneaker"],
  },
  { brand: "Coach", aliases: ["coach"], queries: ["Coach", "Coach Bag", "Coach Tabby", "Coach Sneaker"] },
  { brand: "KAWS", aliases: ["kaws"], queries: ["KAWS", "KAWS Figure", "KAWS Companion"] },
  { brand: "Hot Wheels", aliases: ["hotwheels"], queries: ["Hot Wheels"] },
  { brand: "On", aliases: ["on", "onrunning"], queries: ["On Cloudmonster", "On Cloudswift", "On Cloudnova", "On Cloud X"] },
  { brand: "Puma", aliases: ["puma"], queries: ["Puma", "Puma Speedcat", "Puma Suede", "Puma Palermo", "Puma Clyde"] },
  {
    brand: "Canada Goose",
    aliases: ["canadagoose"],
    queries: ["Canada Goose", "Canada Goose Jacket", "Canada Goose Parka", "Canada Goose Chilliwack"],
  },
  {
    brand: "Louis Vuitton",
    aliases: ["louisvuitton"],
    queries: ["Louis Vuitton", "Louis Vuitton Sneaker", "Louis Vuitton Bag", "Louis Vuitton Trainer"],
  },
  {
    brand: "Hoka One One",
    aliases: ["hokaoneone", "hoka"],
    queries: ["Hoka", "Hoka Bondi", "Hoka Clifton", "Hoka Arahi", "Hoka One One"],
  },
  {
    brand: "Converse",
    aliases: ["converse"],
    queries: ["Converse", "Converse Chuck Taylor", "Converse One Star", "Converse Run Star", "Converse Weapon"],
  },
  {
    brand: "Carhartt",
    aliases: ["carhartt", "carharttwip"],
    queries: ["Carhartt WIP", "Carhartt Jacket", "Carhartt Hoodie", "Carhartt Beanie", "Carhartt Pants"],
  },
  { brand: "Sp5der", aliases: ["sp5der", "spiderworldwide"], queries: ["Sp5der", "Sp5der Hoodie", "Spider Worldwide"] },
  { brand: "Vans", aliases: ["vans"], queries: ["Vans", "Vans Old Skool", "Vans Sk8-Hi", "Vans Authentic", "Vans Slip-On"] },
  { brand: "Prada", aliases: ["prada"], queries: ["Prada", "Prada Sneaker", "Prada Bag", "Prada Nylon"] },
  { brand: "Funko", aliases: ["funko"], queries: ["Funko", "Funko Pop"] },
  { brand: "Hot Toys", aliases: ["hottoys"], queries: ["Hot Toys"] },
  { brand: "AMIRI", aliases: ["amiri"], queries: ["Amiri", "Amiri Hoodie", "Amiri Jeans", "Amiri Sneaker"] },
  {
    brand: "Reebok",
    aliases: ["reebok"],
    queries: ["Reebok", "Reebok Club C", "Reebok Classic", "Reebok Pump", "Reebok Question"],
  },
  { brand: "BAPE", aliases: ["bape", "abathingape"], queries: ["BAPE", "A Bathing Ape", "Bape Shark", "Bape Hoodie"] },
  { brand: "Bandai", aliases: ["bandai"], queries: ["Bandai", "Bandai Figure", "Gundam Bandai"] },
  {
    brand: "Gallery Dept.",
    aliases: ["gallerydept", "gallerydepartment"],
    queries: ["Gallery Dept", "Gallery Department"],
  },
  { brand: "Denim Tears", aliases: ["denimtears"], queries: ["Denim Tears"] },
  { brand: "Dior", aliases: ["dior", "christiandior"], queries: ["Dior", "Dior Sneaker", "Dior Bag", "Christian Dior"] },
  { brand: "Fendi", aliases: ["fendi"], queries: ["Fendi", "Fendi Bag", "Fendi Sneaker"] },
];

const TARGET_PER_BRAND = 100;
const API_PAGE_SIZE = 20;

function usage() {
  console.log(`Usage:
  npm run kicks:dry-run
  npm run kicks:import
  npm run kicks:import -- --query "Air Jordan 4 Retro" --limit-per-query 20
  npm run kicks:import -- --models 1,3,4,5,9,11
  npm run kicks:import -- --keep-existing
  npm run kicks:import -- --fill-low-brands --keep-existing
  npm run kicks:import -- --query "Vans" --limit-per-query 100 --pages 5 --require-brand "Vans"

Environment:
  KICKSDB_API_KEY or KICKSDEV_API_KEY
  VITE_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Notes:
  - Uses KicksDB StockX Standard API search (max ~20 results per page).
  - Imports exact product images from KicksDB's image/gallery fields.
  - Upserts by handle, using the KicksDB product slug.
  - After import, all published rows without the kicksdb tag are unpublished (template/demo seeds are not kept), unless --keep-existing.
`);
}

async function loadEnvFile(file) {
  try {
    const raw = await readFile(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (process.env[key]) continue;
      let value = rest.join("=").trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // Optional file.
  }
}

function parseArgs(argv) {
  const args = {
    dryRun: argv.includes("--dry-run"),
    help: argv.includes("--help") || argv.includes("-h"),
    keepExisting: argv.includes("--keep-existing"),
    fillLowBrands: argv.includes("--fill-low-brands"),
    limitPerQuery: 20,
    pages: 1,
    requireBrand: null,
    queries: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--query" && next) {
      args.queries.push(next);
      i++;
    } else if (arg === "--models" && next) {
      args.queries.push(
        ...next
          .split(",")
          .map((model) => model.trim())
          .filter(Boolean)
          .map((model) => `Air Jordan ${model} Retro`),
      );
      i++;
    } else if (arg === "--limit-per-query" && next) {
      args.limitPerQuery = Number(next);
      i++;
    } else if (arg === "--pages" && next) {
      args.pages = Number(next);
      i++;
    } else if (arg === "--require-brand" && next) {
      args.requireBrand = next;
      i++;
    }
  }

  if (!args.fillLowBrands && !args.queries.length) args.queries = DEFAULT_QUERIES;
  if (!Number.isFinite(args.limitPerQuery) || args.limitPerQuery < 1 || args.limitPerQuery > 400) {
    throw new Error("--limit-per-query must be a number from 1 to 400");
  }
  if (!Number.isFinite(args.pages) || args.pages < 1 || args.pages > 50) {
    throw new Error("--pages must be a number from 1 to 50");
  }

  return args;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBrandKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/@/g, "a")
    .replace(/[^a-z0-9]/g, "");
}

function brandKeysMatch(productKey, aliasKey) {
  if (!productKey || !aliasKey) return false;
  if (productKey === aliasKey) return true;
  // Short aliases (on, lv, …) must be exact — otherwise "on" matches inside "salomon"/"moncler".
  if (aliasKey.length <= 3 || productKey.length <= 3) return productKey === aliasKey;
  // "carharttwip" contains "carhartt"
  if (productKey.includes(aliasKey)) return true;
  // Alias contains product brand only when the product token is long enough
  // e.g. alias "gallerydepartment" contains product "gallerydept"
  if (productKey.length >= 6 && aliasKey.includes(productKey)) return true;
  return false;
}

function brandMatches(productBrand, expectedBrand, aliases = []) {
  const productKey = normalizeBrandKey(productBrand);
  if (!productKey) return false;
  const keys = [normalizeBrandKey(expectedBrand), ...aliases.map(normalizeBrandKey)].filter(Boolean);
  return keys.some((key) => brandKeysMatch(productKey, key));
}

function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeGender(value) {
  const gender = cleanText(value).toLowerCase();
  if (["men", "male", "mens", "men's"].includes(gender)) return "men";
  if (["women", "female", "womens", "women's"].includes(gender)) return "women";
  if (["kid", "kids", "child", "children", "youth", "preschool", "toddler"].includes(gender)) return "kids";
  return "unisex";
}

function trendScore(product) {
  const rank = Number(product.rank);
  const weeklyOrders = Number(product.weekly_orders);
  const rankScore = Number.isFinite(rank) && rank > 0 ? Math.max(55, 105 - Math.log10(rank + 1) * 18) : 70;
  const orderScore = Number.isFinite(weeklyOrders) ? Math.min(20, weeklyOrders / 5) : 0;
  return Math.round(Math.min(100, rankScore + orderScore));
}

function inferCatalogKind(product) {
  const haystack = [
    product.title,
    product.model,
    product.primary_title,
    product.secondary_title,
    product.product_type,
    product.category,
    product.secondary_category,
    ...(Array.isArray(product.categories) ? product.categories : []),
  ]
    .map(cleanText)
    .join(" ")
    .toLowerCase();

  // Headwear / handbags / collectibles first — StockX often labels these product_type "streetwear" or "collectibles".
  if (
    product.product_type === "collectibles" ||
    product.category === "Collectibles" ||
    /\b(collectible|collectibles|funko|bearbrick|kaws|hot toys|lego|skateboard deck|action figure|hot wheels)\b/.test(
      haystack,
    )
  ) {
    return "accessory";
  }
  if (
    /\b(hat|hats|beanie|beanies|skullcap|toque|bucket hat|trucker cap|camp cap|snapback|fitted cap|ball cap|visor|59fifty)\b/.test(
      haystack,
    ) ||
    (/\bcap\b/.test(haystack) &&
      !/\b(sneaker|shoe|dunk|yeezy|air max|jordan [0-9]|air jordan [0-9]|cap and gown)\b/.test(haystack))
  ) {
    return "accessory";
  }
  if (
    /\b(handbag|handbags|neverfull|speedy|keepall|baguette|peekaboo|dionysus|jodie|cassette bag|book tote|crossbody|clutch|purse)\b/.test(
      haystack,
    ) ||
    product.product_type === "handbags" ||
    product.category === "Handbags"
  ) {
    return "accessory";
  }
  if (/\b(hoodie|tee|t-shirt|shirt|jacket|fleece|crewneck|sweatshirt|sweatpant|shorts|pants|jersey|apparel)\b/.test(haystack)) {
    return "apparel";
  }
  if (/\bcap and gown\b/.test(haystack) || /\b(sneaker|footwear)\b/.test(haystack)) {
    return "sneaker";
  }
  if (/\b(backpack|duffle|duffel|tote|watch|watches)\b/.test(haystack)) {
    return "accessory";
  }
  if (/\bbag\b/.test(haystack) && !/\bbaggy\b/.test(haystack)) {
    return "accessory";
  }
  if (product.product_type === "streetwear" && !/\b(sneaker|shoe|dunk|yeezy)\b/.test(haystack)) {
    return "apparel";
  }
  return "sneaker";
}

function activityTagsFor(product, kind) {
  if (kind !== "sneaker") return ["training"];
  const haystack = [product.title, product.model, product.primary_title, product.category, product.secondary_category]
    .map(cleanText)
    .join(" ")
    .toLowerCase();
  if (/\b(football|gridiron|nfl|vapor edge|alpha menace|adizero football|untouchable)\b/.test(haystack)) {
    return ["football", "training"];
  }
  if (/\b(soccer|mercurial|phantom|predator|copa|f50|tiempo)\b/.test(haystack)) {
    return ["soccer", "training"];
  }
  if (/\b(tennis|nikecourt|barricade|gel resolution|gel-resolution|court ff)\b/.test(haystack)) {
    return ["tennis", "training"];
  }
  if (/\b(jordan|kobe|basketball|dunk|foamposite)\b/.test(haystack)) return ["basketball", "training"];
  if (/\b(asics|gel-|new balance|990|9060|2002r|air max|hoka|bondi|on cloud|runner|running)\b/.test(haystack)) {
    return ["running", "training"];
  }
  if (/\b(samba|campus|gazelle|club c|old skool|chuck taylor|speedcat)\b/.test(haystack)) return ["training"];
  return ["training"];
}

function productToCatalogRow(product) {
  const title = cleanText(product.title);
  const handle = cleanText(product.slug) || slugify(title);
  if (isBlockedCatalogHandle(handle)) return null;
  const brand = cleanText(product.brand) || "Jordan";
  const kind = inferCatalogKind(product);
  const gender = normalizeGender(product.gender);
  const rawImage = cleanText(product.image);
  const gallery = Array.isArray(product.gallery) ? product.gallery.map(cleanText).filter(Boolean) : [];
  const image = pickBestProductImageUrl(rawImage, gallery);
  const priceMin = Number(product.min_price ?? product.avg_price ?? 0);
  const priceMax = Number(product.max_price ?? product.avg_price ?? priceMin);
  const modelSlug = slugify(cleanText(product.model || product.primary_title || title));
  const colorSlug = slugify(cleanText(product.secondary_title || ""));
  const categorySlug = slugify(cleanText(product.secondary_category || product.category || "sneakers"));

  if (!title || !handle || !image || !Number.isFinite(priceMin) || !Number.isFinite(priceMax) || priceMin <= 0 || priceMax <= 0) {
    return null;
  }

  return {
    handle,
    title,
    brand,
    description: cleanText(product.description || product.short_description) || `${title} imported from KicksDB.`,
    department_slug: kind === "accessory" ? "accessories" : gender,
    tags: uniq([
      kind === "accessory" ? "dept-accessories" : `dept-${gender}`,
      kind === "accessory" ? `dept-${gender}` : null,
      kind === "sneaker" ? "sneakers" : kind,
      slugify(brand),
      modelSlug,
      colorSlug,
      categorySlug,
      cleanText(product.product_type) ? slugify(product.product_type) : null,
      product.product_type === "collectibles" || product.category === "Collectibles" ? "collectibles" : null,
      product.sku ? `sku-${slugify(product.sku)}` : null,
      kind === "sneaker" ? "home-trending-sneakers" : kind === "apparel" ? "home-featured-apparel" : "home-featured-accessories",
      "kicksdb",
    ]),
    product_type: kind,
    home_rails: uniq([kind === "sneaker" ? "trending-sneakers" : kind === "apparel" ? "featured-apparel" : "featured-accessories", "popular-local"]),
    activities: activityTagsFor(product, kind),
    variant_size_preset: kind === "sneaker" ? "shoe" : kind,
    featured_image_url: image,
    image_gallery: uniq([image, rawImage, ...gallery].filter(Boolean)).slice(0, 8),
    price_min: Math.max(0, Math.round(priceMin)),
    price_max: Math.max(0, Math.round(priceMax)),
    currency: "USD",
    trend_score: trendScore(product),
    category: cleanText(product.secondary_category || product.category) || "sneakers",
    gender,
    source_url: cleanText(product.link) || `https://stockx.com/${handle}`,
    published: true,
  };
}

async function hideNonKicksDbRows(supabase) {
  function isKicksDbRow(tags) {
    if (!Array.isArray(tags)) return false;
    return tags.some((x) => String(x).toLowerCase() === "kicksdb");
  }

  const pageSize = 1000;
  const rows = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("catalog_products")
      .select("handle,tags,published")
      .eq("published", true)
      .order("handle")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  const handles = rows
    .filter((row) => !isKicksDbRow(row.tags))
    .map((row) => row.handle)
    .filter(Boolean);

  for (let i = 0; i < handles.length; i += 100) {
    const chunk = handles.slice(i, i + 100);
    const { error: updateError } = await supabase.from("catalog_products").update({ published: false }).in("handle", chunk);
    if (updateError) throw updateError;
  }

  console.log(`Unpublished ${handles.length} non-KicksDB catalog row(s).`);
}

async function fetchProducts(query, apiKey, { limit = API_PAGE_SIZE, pages = 1 } = {}) {
  const pageCount = Math.max(pages, Math.ceil(limit / API_PAGE_SIZE));
  const collected = [];
  const seen = new Set();

  for (let page = 1; page <= pageCount && collected.length < limit; page++) {
    const url = new URL(API_BASE);
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(API_PAGE_SIZE));
    url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`KicksDB request failed for "${query}" page ${page} (${response.status}): ${body.slice(0, 300)}`);
    }

    const json = await response.json();
    const quota = response.headers.get("x-quota-current");
    if (quota && page === 1) console.log(`KicksDB quota used: ${quota}`);

    const batch = Array.isArray(json.data) ? json.data : [];
    if (!batch.length) break;

    for (const product of batch) {
      const id = cleanText(product.uuid || product.id || product.slug || product.link) || `${product.brand}-${product.title}`;
      if (seen.has(id)) continue;
      seen.add(id);
      collected.push(product);
      if (collected.length >= limit) break;
    }

    if (batch.length < API_PAGE_SIZE) break;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  return collected;
}

async function loadPublishedBrandCounts(supabase) {
  const counts = new Map();
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("catalog_products")
      .select("brand")
      .eq("published", true)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const brand = cleanText(row.brand) || "(none)";
      counts.set(brand, (counts.get(brand) ?? 0) + 1);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return counts;
}

function catalogCountForBrand(counts, brand, aliases = []) {
  const keys = [normalizeBrandKey(brand), ...aliases.map(normalizeBrandKey)].filter(Boolean);
  let total = 0;
  for (const [name, n] of counts) {
    const key = normalizeBrandKey(name);
    if (keys.some((k) => brandKeysMatch(key, k))) total += n;
  }
  return total;
}

async function collectFillLowBrandRows(apiKey, supabase) {
  const counts = await loadPublishedBrandCounts(supabase);
  const rowsByHandle = new Map();

  for (const entry of FILL_LOW_BRANDS) {
    const have = catalogCountForBrand(counts, entry.brand, entry.aliases);
    const need = Math.max(0, TARGET_PER_BRAND - have);
    console.log(`\n${entry.brand}: catalog=${have}, need=${need} more to reach ${TARGET_PER_BRAND}`);
    if (need === 0) {
      console.log(`  skip — already at target`);
      continue;
    }

    let addedForBrand = 0;
    const pages = Math.min(10, Math.max(3, Math.ceil((need + 40) / API_PAGE_SIZE)));

    for (const query of entry.queries) {
      if (addedForBrand >= need * 2) break; // gather some headroom for filter drops
      console.log(`  Searching: ${query} (up to ${pages} pages)`);
      try {
        const products = await fetchProducts(query, apiKey, {
          limit: pages * API_PAGE_SIZE,
          pages,
        });
        let matched = 0;
        for (const product of products) {
          if (!brandMatches(product.brand, entry.brand, entry.aliases)) continue;
          const row = productToCatalogRow(product);
          if (!row) continue;
          if (!rowsByHandle.has(row.handle)) {
            rowsByHandle.set(row.handle, row);
            addedForBrand += 1;
          }
          matched += 1;
        }
        console.log(`    api=${products.length}, brand-matched importable≈${matched}, new handles this brand=${addedForBrand}`);
      } catch (error) {
        console.warn(`    ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  return [...rowsByHandle.values()];
}

async function main() {
  await loadEnvFile(path.join(root, ".env"));
  await loadEnvFile(path.join(root, ".env.local"));

  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const apiKey = process.env.KICKSDB_API_KEY ?? process.env.KICKSDEV_API_KEY;
  if (!apiKey) {
    console.error("Missing KICKSDB_API_KEY. Add it to .env.local from https://kicks.dev/api-keys.");
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!args.dryRun && (!supabaseUrl || !serviceRole)) {
    console.error("Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exitCode = 1;
    return;
  }

  const supabase =
    supabaseUrl && serviceRole
      ? createClient(supabaseUrl, serviceRole, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  let rows;
  if (args.fillLowBrands) {
    if (!supabase) {
      console.error("--fill-low-brands needs Supabase credentials to read current brand counts.");
      process.exitCode = 1;
      return;
    }
    console.log(`Filling low brands toward ${TARGET_PER_BRAND} published items each…`);
    rows = await collectFillLowBrandRows(apiKey, supabase);
    // Fill mode always keeps existing catalog rows.
    args.keepExisting = true;
  } else {
    const rowsByHandle = new Map();
    for (const query of args.queries) {
      console.log(`Searching KicksDB: ${query}`);
      try {
        const products = await fetchProducts(query, apiKey, {
          limit: args.limitPerQuery,
          pages: args.pages,
        });
        for (const product of products) {
          if (args.requireBrand && !brandMatches(product.brand, args.requireBrand)) continue;
          const row = productToCatalogRow(product);
          if (row) rowsByHandle.set(row.handle, row);
        }
      } catch (error) {
        console.warn(error instanceof Error ? error.message : error);
      }
    }
    rows = [...rowsByHandle.values()];
  }

  rows.sort((a, b) => b.trend_score - a.trend_score || a.title.localeCompare(b.title));
  console.log(`Prepared ${rows.length} KicksDB product(s).`);
  console.table(rows.slice(0, 30).map((row) => ({ handle: row.handle, title: row.title, brand: row.brand, price_min: row.price_min, trend_score: row.trend_score })));
  if (rows.length > 30) console.log(`...and ${rows.length - 30} more.`);
  if (!rows.length) {
    console.log("No importable KicksDB products found.");
    return;
  }

  if (args.dryRun) {
    console.log("Dry run only. Nothing was imported.");
    return;
  }

  const chunkSize = 150;
  let imported = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("catalog_products").upsert(chunk, { onConflict: "handle" });
    if (error) {
      console.error(`Import failed on chunk ${i / chunkSize + 1}:`);
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    imported += chunk.length;
    console.log(`Upserted ${imported}/${rows.length}…`);
  }

  console.log(`Imported ${imported} KicksDB product(s) into catalog_products.`);

  const blocked = [...BLOCKED_CATALOG_HANDLES];
  const { error: delErr } = await supabase.from("catalog_products").delete().in("handle", blocked);
  if (delErr) console.warn("Could not remove blocked catalog handles:", delErr.message);
  else console.log(`Removed ${blocked.length} blocked catalog handle(s).`);

  if (!args.keepExisting) await hideNonKicksDbRows(supabase);

  if (args.fillLowBrands) {
    const after = await loadPublishedBrandCounts(supabase);
    console.log("\n=== Brand counts after fill ===");
    for (const entry of FILL_LOW_BRANDS) {
      const n = catalogCountForBrand(after, entry.brand, entry.aliases);
      const mark = n >= TARGET_PER_BRAND ? "OK" : "LOW";
      console.log(`${mark.padEnd(3)} ${entry.brand.padEnd(18)} ${n}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
