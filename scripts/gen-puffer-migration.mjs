#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const items = JSON.parse(await readFile(path.join(root, "data", "puffer-outerwear-catalog.json"), "utf8"));

function esc(s) {
  return String(s).replace(/'/g, "''");
}
function arr(a) {
  return `array[${a.map((x) => `'${esc(x)}'`).join(",")}]`;
}

const vals = items
  .map(
    (i) => `  (
    '${esc(i.handle)}',
    '${esc(i.title)}',
    '${esc(i.brand)}',
    '${esc(i.description)}',
    '${esc(i.department_slug)}',
    ${arr(i.tags)},
    '${esc(i.product_type)}',
    ${arr(i.home_rails)},
    ${arr(i.activities ?? [])},
    '${i.variant_size_preset}',
    '${esc(i.featured_image_url)}',
    ${arr(i.image_gallery ?? [i.featured_image_url])},
    ${i.price_min}, ${i.price_max}, 'USD', ${i.trend_score},
    '${esc(i.category)}', '${esc(i.gender)}',
    null,
    true
  )`,
  )
  .join(",\n");

const sql = `-- Puffer / down outerwear (source: data/puffer-outerwear-catalog.json, npm run seed:puffer)

insert into public.catalog_products (
  handle, title, brand, description, department_slug, tags, product_type,
  home_rails, activities, variant_size_preset, featured_image_url, image_gallery,
  price_min, price_max, currency, trend_score, category, gender, source_url, published
)
values
${vals}
on conflict (handle) do update set
  title = excluded.title,
  brand = excluded.brand,
  description = excluded.description,
  department_slug = excluded.department_slug,
  tags = excluded.tags,
  product_type = excluded.product_type,
  home_rails = excluded.home_rails,
  activities = excluded.activities,
  variant_size_preset = excluded.variant_size_preset,
  featured_image_url = excluded.featured_image_url,
  image_gallery = excluded.image_gallery,
  price_min = excluded.price_min,
  price_max = excluded.price_max,
  currency = excluded.currency,
  trend_score = excluded.trend_score,
  category = excluded.category,
  gender = excluded.gender,
  source_url = excluded.source_url,
  published = excluded.published,
  updated_at = now();
`;

const out = path.join(root, "supabase", "migrations", "20250515170500_catalog_puffer_outerwear_seed.sql");
await writeFile(out, sql);
console.log(`Wrote ${out} (${items.length} products)`);
