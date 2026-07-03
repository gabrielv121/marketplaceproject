#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
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

await loadEnvFile(".env.local");
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Need Supabase URL + key in .env.local");
  process.exit(1);
}

const PLACEHOLDER =
  /product-placeholder|placeholder-default|stockx-assets\.imgix\.net\/media\/product-placeholder/i;

function hasReal(r) {
  for (const u of [r.featured_image_url, ...(r.image_gallery ?? [])]) {
    if (u?.trim() && !PLACEHOLDER.test(u.trim())) return true;
  }
  return false;
}

function isAccessory(r) {
  const blob = `${r.title} ${r.category ?? ""} ${(r.tags ?? []).join(" ")}`.toLowerCase();
  return (
    r.product_type === "accessory" ||
    r.department_slug === "accessories" ||
    r.variant_size_preset === "accessory" ||
    /\b(watch|watches|cap|hat|beanie|bag|tote|backpack|duffle|duffel|sling|crossbody|messenger|satchel|wallet|belt|sunglass|headwear)\b/.test(
      blob,
    )
  );
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const rows = [];
let offset = 0;
for (;;) {
  const { data, error } = await sb
    .from("catalog_products")
    .select(
      "handle,title,brand,product_type,department_slug,variant_size_preset,tags,featured_image_url,image_gallery,published",
    )
    .eq("published", true)
    .range(offset, offset + 999);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!data?.length) break;
  rows.push(...data);
  if (data.length < 1000) break;
  offset += 1000;
}

const kicks = rows.filter((r) => (r.tags ?? []).some((t) => String(t).toLowerCase() === "kicksdb"));
const accAll = rows.filter(isAccessory);
const accKicks = kicks.filter(isAccessory);
const accKicksPhoto = accKicks.filter(hasReal);

console.log(`Published catalog total: ${rows.length}`);
console.log(`Published with kicksdb tag: ${kicks.length}`);
console.log(`Accessories (published, any source): ${accAll.length}`);
console.log(`Kicksdb accessories: ${accKicks.length}`);
console.log(`Kicksdb accessories with real photo (shown in app): ${accKicksPhoto.length}`);
console.log(`Kicksdb accessories placeholder-only (hidden): ${accKicks.length - accKicksPhoto.length}`);
console.log("");
console.log("Handles shown on site (accessories):");
for (const r of accKicksPhoto) {
  console.log(`  ${r.brand ?? "?"} — ${r.handle}`);
}
