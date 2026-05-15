#!/usr/bin/env node
/**
 * Upsert avant-garde / designer catalog rows from data/designer-catalog.json.
 * Run: node scripts/seed-designer-catalog.mjs
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

function toRow(item) {
  const gallery = item.image_gallery ?? [item.featured_image_url];
  return {
    handle: item.handle,
    title: item.title,
    brand: item.brand,
    description: item.description,
    department_slug: item.department_slug,
    tags: item.tags,
    product_type: item.product_type,
    home_rails: item.home_rails,
    activities: item.activities ?? [],
    variant_size_preset: item.variant_size_preset,
    featured_image_url: item.featured_image_url,
    image_gallery: gallery,
    price_min: item.price_min,
    price_max: item.price_max,
    currency: item.currency ?? "USD",
    trend_score: item.trend_score ?? 85,
    category: item.category ?? null,
    gender: item.gender ?? null,
    source_url: item.source_url ?? null,
    published: item.published !== false,
  };
}

await loadEnvFile(".env.local");
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const raw = await readFile(path.join(root, "data", "designer-catalog.json"), "utf8");
const items = JSON.parse(raw);
const rows = items.map(toRow);

const sb = createClient(url, key, { auth: { persistSession: false } });

const brands = [...new Set(rows.map((r) => r.brand))];
console.log(`Upserting ${rows.length} designer product(s) across ${brands.length} brand(s):`);
console.log(brands.join(", "));

const { error } = await sb.from("catalog_products").upsert(rows, { onConflict: "handle" });
if (error) {
  console.error("Upsert failed:", error.message);
  process.exit(1);
}

for (const brand of brands) {
  const { count } = await sb
    .from("catalog_products")
    .select("id", { count: "exact", head: true })
    .eq("published", true)
    .ilike("brand", brand);
  console.log(`  ${brand}: ${count ?? 0} published`);
}

const { count: designerTagged } = await sb
  .from("catalog_products")
  .select("id", { count: "exact", head: true })
  .eq("published", true)
  .contains("tags", ["designer"]);
console.log(`Published rows tagged designer: ${designerTagged ?? 0}`);
