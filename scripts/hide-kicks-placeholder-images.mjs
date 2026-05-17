#!/usr/bin/env node
/**
 * Unpublish published KicksDB rows that only have StockX placeholder images.
 * Run: npm run kicks:hide-placeholders
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

const dryRun = process.argv.includes("--dry-run");
const sb = createClient(url, key, { auth: { persistSession: false } });
const pageSize = 1000;
const rows = [];
let offset = 0;
for (;;) {
  const { data, error } = await sb
    .from("catalog_products")
    .select("handle,title,brand,featured_image_url,image_gallery,tags,published")
    .eq("published", true)
    .order("handle")
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

const kicksRows = rows.filter((r) => (r.tags ?? []).some((t) => String(t).toLowerCase() === "kicksdb"));
const toHide = kicksRows.filter((r) => !hasRealProductImage(r));
console.log(`Published KicksDB rows: ${kicksRows.length}`);
console.log(`Placeholder-only (will unpublish): ${toHide.length}`);
if (!toHide.length) {
  console.log("Nothing to do.");
  process.exit(0);
}

for (const r of toHide.slice(0, 40)) {
  console.log(`  ${r.brand ?? "?"} — ${r.handle}`);
}
if (toHide.length > 40) console.log(`  … and ${toHide.length - 40} more`);

if (dryRun) {
  console.log("\nDry run — no changes written.");
  process.exit(0);
}

const handles = toHide.map((r) => r.handle);
for (let i = 0; i < handles.length; i += 100) {
  const chunk = handles.slice(i, i + 100);
  const { error } = await sb.from("catalog_products").update({ published: false }).in("handle", chunk);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
}

console.log(`\nUnpublished ${handles.length} row(s).`);
