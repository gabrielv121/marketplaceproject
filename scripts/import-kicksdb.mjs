#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
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
  "Rhude Hoodie",
  "Corteiz Hoodie",
  "Sp5der Hoodie",
  "Carhartt WIP Jacket",
  "Carhartt WIP Hoodie",
  "Amiri Hoodie",
];

function usage() {
  console.log(`Usage:
  npm run kicks:dry-run
  npm run kicks:import
  npm run kicks:import -- --query "Air Jordan 4 Retro" --limit-per-query 20
  npm run kicks:import -- --models 1,3,4,5,9,11
  npm run kicks:import -- --keep-existing

Environment:
  KICKSDB_API_KEY or KICKSDEV_API_KEY
  VITE_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Notes:
  - Uses KicksDB StockX Standard API search.
  - Imports exact product images from KicksDB's image/gallery fields.
  - Upserts by handle, using the KicksDB product slug.
  - After import, non-KicksDB rows are unpublished unless they carry template tags: designer, avant-garde, puffer, or ugg.
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
    limitPerQuery: 20,
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
    }
  }

  if (!args.queries.length) args.queries = DEFAULT_QUERIES;
  if (!Number.isFinite(args.limitPerQuery) || args.limitPerQuery < 1 || args.limitPerQuery > 100) {
    throw new Error("--limit-per-query must be a number from 1 to 100");
  }

  return args;
}

function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
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
  if (/\b(hoodie|tee|t-shirt|shirt|jacket|fleece|crewneck|sweatshirt|sweatpant|shorts|pants|jersey|apparel|streetwear)\b/.test(haystack)) {
    return "apparel";
  }
  if (/\b(hat|cap|beanie|bag|backpack|duffle|accessory|accessories|watch)\b/.test(haystack)) {
    return "accessory";
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
  const brand = cleanText(product.brand) || "Jordan";
  const kind = inferCatalogKind(product);
  const gender = normalizeGender(product.gender);
  const image = cleanText(product.image);
  const gallery = Array.isArray(product.gallery) ? product.gallery.map(cleanText).filter(Boolean) : [];
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
    department_slug: gender,
    tags: uniq([
      `dept-${gender}`,
      kind === "sneaker" ? "sneakers" : kind,
      slugify(brand),
      modelSlug,
      colorSlug,
      categorySlug,
      cleanText(product.product_type) ? slugify(product.product_type) : null,
      product.sku ? `sku-${slugify(product.sku)}` : null,
      kind === "sneaker" ? "home-trending-sneakers" : kind === "apparel" ? "home-featured-apparel" : "home-featured-accessories",
      "kicksdb",
    ]),
    product_type: kind,
    home_rails: uniq([kind === "sneaker" ? "trending-sneakers" : kind === "apparel" ? "featured-apparel" : "featured-accessories", "popular-local"]),
    activities: activityTagsFor(product, kind),
    variant_size_preset: kind === "sneaker" ? "shoe" : kind,
    featured_image_url: image,
    image_gallery: uniq([image, ...gallery]).slice(0, 8),
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
  /** Keep template / manual seeds live when re-importing KicksDB (they are not API rows). */
  function isProtectedCatalogRow(tags) {
    if (!Array.isArray(tags)) return false;
    const lower = new Set(tags.map((x) => String(x).toLowerCase()));
    if (lower.has("kicksdb")) return true;
    if (lower.has("designer")) return true;
    if (lower.has("avant-garde")) return true;
    if (lower.has("puffer")) return true;
    if (lower.has("ugg")) return true;
    return false;
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
    .filter((row) => !isProtectedCatalogRow(row.tags))
    .map((row) => row.handle)
    .filter(Boolean);

  for (let i = 0; i < handles.length; i += 100) {
    const chunk = handles.slice(i, i + 100);
    const { error: updateError } = await supabase.from("catalog_products").update({ published: false }).in("handle", chunk);
    if (updateError) throw updateError;
  }

  console.log(`Unpublished ${handles.length} non-KicksDB catalog row(s) (designer / puffer / UGG template rows are kept).`);
}

async function fetchProducts(query, apiKey, limit) {
  const url = new URL(API_BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(limit));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`KicksDB request failed for "${query}" (${response.status}): ${body.slice(0, 300)}`);
  }

  const json = await response.json();
  const quota = response.headers.get("x-quota-current");
  if (quota) console.log(`KicksDB quota used: ${quota}`);
  return Array.isArray(json.data) ? json.data.slice(0, limit) : [];
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

  const rowsByHandle = new Map();
  for (const query of args.queries) {
    console.log(`Searching KicksDB: ${query}`);
    const products = await fetchProducts(query, apiKey, args.limitPerQuery);
    for (const product of products) {
      const row = productToCatalogRow(product);
      if (row) rowsByHandle.set(row.handle, row);
    }
  }

  const rows = [...rowsByHandle.values()].sort((a, b) => b.trend_score - a.trend_score || a.title.localeCompare(b.title));
  console.log(`Prepared ${rows.length} KicksDB product(s).`);
  console.table(rows.slice(0, 30).map((row) => ({ handle: row.handle, title: row.title, price_min: row.price_min, trend_score: row.trend_score })));
  if (rows.length > 30) console.log(`...and ${rows.length - 30} more.`);
  if (!rows.length) {
    console.log("No importable KicksDB products found.");
    return;
  }

  if (args.dryRun) {
    console.log("Dry run only. Nothing was imported.");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    console.error("Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("catalog_products").upsert(rows, { onConflict: "handle" });
  if (error) {
    console.error("Import failed:");
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Imported ${rows.length} KicksDB product(s) into catalog_products.`);
  if (!args.keepExisting) await hideNonKicksDbRows(supabase);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
