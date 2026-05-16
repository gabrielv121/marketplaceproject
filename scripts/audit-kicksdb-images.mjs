#!/usr/bin/env node
/**
 * List published catalog rows with only StockX placeholder images (no real product photo).
 * Run: npm run kicks:audit-images
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { hasRealProductImage } from "./lib/stockx-image.mjs";

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
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const pageSize = 1000;
const rows = [];
let offset = 0;
for (;;) {
  const { data, error } = await sb
    .from("catalog_products")
    .select("handle,title,brand,featured_image_url,image_gallery,published")
    .eq("published", true)
    .order("brand")
    .range(offset, offset + pageSize - 1);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!data?.length) break;
  rows.push(...data);
  if (data.length < pageSize) break;
  offset += pageSize;
}

const missing = rows.filter((r) => !hasRealProductImage(r));
const withPhoto = rows.length - missing.length;

console.log(`Published catalog: ${rows.length}`);
console.log(`With product photo: ${withPhoto}`);
console.log(`Placeholder only (StockX logo): ${missing.length}`);
console.log("");

if (missing.length) {
  console.log("Handles without a real image:");
  for (const r of missing.slice(0, 50)) {
    console.log(`  ${r.brand ?? "?"} — ${r.handle}`);
  }
  if (missing.length > 50) console.log(`  … and ${missing.length - 50} more`);
}
