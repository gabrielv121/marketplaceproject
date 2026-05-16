#!/usr/bin/env node
/**
 * Upsert bags, caps, watches from data/accessories-catalog.json.
 * Run: npm run seed:accessories
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
    trend_score: item.trend_score ?? 70,
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

const raw = await readFile(path.join(root, "data", "accessories-catalog.json"), "utf8");
const rows = JSON.parse(raw).map(toRow);

const sb = createClient(url, key, { auth: { persistSession: false } });

console.log(`Upserting ${rows.length} accessory item(s)...`);
const { error } = await sb.from("catalog_products").upsert(rows, { onConflict: "handle" });
if (error) {
  console.error("Upsert failed:", error.message);
  process.exit(1);
}

const { data: mis, error: misErr } = await sb
  .from("catalog_products")
  .select("handle,title")
  .eq("product_type", "accessory")
  .or("tags.cs.{sneakers},title.ilike.%cap and gown%,handle.ilike.%cap-and-gown%");
if (misErr) {
  console.warn("Could not list misclassified rows:", misErr.message);
} else if (mis?.length) {
  const handles = mis.map((r) => r.handle);
  const { error: fixErr } = await sb
    .from("catalog_products")
    .update({
      product_type: "sneaker",
      variant_size_preset: "shoe",
      updated_at: new Date().toISOString(),
    })
    .in("handle", handles);
  if (fixErr) console.warn("Reclassify sneakers failed:", fixErr.message);
  else console.log(`Reclassified ${handles.length} Cap and Gown sneaker(s) from accessory → sneaker.`);
}

const { count } = await sb
  .from("catalog_products")
  .select("id", { count: "exact", head: true })
  .eq("published", true)
  .eq("department_slug", "accessories");
console.log(`Published accessories in DB: ${count ?? "?"}`);
console.log("Done.");
