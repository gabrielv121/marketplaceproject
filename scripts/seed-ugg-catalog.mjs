#!/usr/bin/env node
/**
 * Upsert UGG seed rows into catalog_products (uses service role from .env.local).
 * Run: node scripts/seed-ugg-catalog.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnvFile(file) {
  try {
    const raw = await readFile(path.join(root, file), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const i = trimmed.indexOf("=");
      const key = trimmed.slice(0, i).trim();
      if (process.env[key]) continue;
      let value = trimmed.slice(i + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

const ROWS = [
  {
    handle: "ugg-tasman-chestnut",
    title: "UGG Tasman — Chestnut",
    brand: "UGG",
    description: "Heritage slipper with suede upper and plush lining.",
    department_slug: "women",
    tags: ["dept-women", "sneakers", "slipper", "ugg", "home-trending-sneakers", "kicksdb"],
    product_type: "sneaker",
    home_rails: ["trending-sneakers", "popular-local", "new-at-exch"],
    activities: ["training"],
    variant_size_preset: "shoe",
    featured_image_url: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=900&q=85",
    image_gallery: ["https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=1200&q=85"],
    price_min: 98,
    price_max: 130,
    currency: "USD",
    trend_score: 88,
    category: "slippers",
    gender: "women",
    published: true,
  },
  {
    handle: "ugg-tazz-gazette",
    title: "UGG Tazz — Gazette",
    brand: "UGG",
    description: "Platform slipper with bold UGG branding.",
    department_slug: "women",
    tags: ["dept-women", "sneakers", "slipper", "ugg", "home-trending-sneakers", "kicksdb"],
    product_type: "sneaker",
    home_rails: ["trending-sneakers", "popular-local"],
    activities: ["training"],
    variant_size_preset: "shoe",
    featured_image_url: "https://images.unsplash.com/photo-1603487742131-4160f58f43b7?w=900&q=85",
    image_gallery: ["https://images.unsplash.com/photo-1603487742131-4160f58f43b7?w=1200&q=85"],
    price_min: 110,
    price_max: 145,
    currency: "USD",
    trend_score: 86,
    category: "slippers",
    gender: "women",
    published: true,
  },
  {
    handle: "ugg-classic-mini-ii-black",
    title: "UGG Classic Mini II — Black",
    brand: "UGG",
    description: "Ankle-height Classic silhouette with suede upper.",
    department_slug: "women",
    tags: ["dept-women", "sneakers", "boot", "ugg", "home-trending-sneakers", "kicksdb"],
    product_type: "sneaker",
    home_rails: ["trending-sneakers", "popular-local", "below-retail"],
    activities: ["training", "running"],
    variant_size_preset: "shoe",
    featured_image_url: "https://images.unsplash.com/photo-1608256246200-53e635bfc0f1?w=900&q=85",
    image_gallery: ["https://images.unsplash.com/photo-1608256246200-53e635bfc0f1?w=1200&q=85"],
    price_min: 140,
    price_max: 185,
    currency: "USD",
    trend_score: 84,
    category: "boots",
    gender: "women",
    published: true,
  },
  {
    handle: "ugg-neumel-chocolate",
    title: "UGG Neumel — Chocolate",
    brand: "UGG",
    description: "Chukka-inspired boot with wool lining.",
    department_slug: "men",
    tags: ["dept-men", "sneakers", "boot", "ugg", "home-trending-sneakers", "kicksdb"],
    product_type: "sneaker",
    home_rails: ["trending-sneakers", "popular-local"],
    activities: ["training"],
    variant_size_preset: "shoe",
    featured_image_url: "https://images.unsplash.com/photo-1605812860427-4024433a70fd?w=900&q=85",
    image_gallery: ["https://images.unsplash.com/photo-1605812860427-4024433a70fd?w=1200&q=85"],
    price_min: 155,
    price_max: 210,
    currency: "USD",
    trend_score: 82,
    category: "boots",
    gender: "men",
    published: true,
  },
];

await loadEnvFile(".env.local");
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: before } = await sb.from("catalog_products").select("handle,brand,published").ilike("brand", "%UGG%");
console.log("Before:", before?.length ?? 0, "row(s) matching brand UGG");
if (before?.length) console.table(before);

const { error } = await sb.from("catalog_products").upsert(ROWS, { onConflict: "handle" });
if (error) {
  console.error("Upsert failed:", error.message);
  process.exit(1);
}

const { data: after } = await sb
  .from("catalog_products")
  .select("handle,title,brand,published")
  .eq("published", true)
  .ilike("brand", "UGG");
console.log(`Upserted ${ROWS.length} UGG product(s). Published in DB:`, after?.length ?? 0);
if (after?.length) console.table(after);

const { count } = await sb
  .from("catalog_products")
  .select("id", { count: "exact", head: true })
  .eq("published", true);
console.log("Total published catalog_products:", count);
