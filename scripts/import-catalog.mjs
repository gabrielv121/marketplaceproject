#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const DEFAULT_CSV = path.join(root, "data", "catalog-products.csv");
const ARRAY_COLUMNS = new Set(["tags", "home_rails", "activities", "image_gallery"]);
const NUMBER_COLUMNS = new Set(["price_min", "price_max", "trend_score"]);
const BOOLEAN_COLUMNS = new Set(["published"]);
const REQUIRED = ["title", "price_min", "price_max"];

function usage() {
  console.log(`Usage:
  npm run catalog:import
  npm run catalog:import -- data/catalog-products.csv
  npm run catalog:dry-run -- data/catalog-products.csv

Environment:
  VITE_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

CSV arrays can be pipe, semicolon, comma, or Postgres array style:
  sneakers|home-trending-sneakers|activity-running
  "{sneakers,home-trending-sneakers,activity-running}"
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

function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        value += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        value += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(value);
      value = "";
    } else if (ch === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (ch !== "\r") {
      value += ch;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim()));
}

function parseArray(value) {
  const v = value.trim();
  if (!v) return [];
  if (v.startsWith("{") && v.endsWith("}")) {
    return v
      .slice(1, -1)
      .split(",")
      .map((x) => x.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }
  const delimiter = v.includes("|") ? "|" : v.includes(";") ? ";" : ",";
  return v
    .split(delimiter)
    .map((x) => x.trim())
    .filter(Boolean);
}

function coerce(column, value) {
  const v = value.trim();
  if (ARRAY_COLUMNS.has(column)) return parseArray(v);
  if (NUMBER_COLUMNS.has(column)) return v ? Number(v) : null;
  if (BOOLEAN_COLUMNS.has(column)) return !["false", "0", "no", "n"].includes(v.toLowerCase());
  return v || null;
}

function rowToProduct(headers, values, index) {
  const product = {};
  for (let i = 0; i < headers.length; i++) {
    const column = headers[i];
    if (!column) continue;
    product[column] = coerce(column, values[i] ?? "");
  }

  if (!product.handle) product.handle = slugify(`${product.brand ?? ""} ${product.title ?? ""}`);
  if (!product.currency) product.currency = "USD";
  if (product.published == null) product.published = true;
  if (product.trend_score == null) product.trend_score = 0;

  const missing = REQUIRED.filter((key) => product[key] == null || product[key] === "");
  if (missing.length) {
    throw new Error(`Row ${index + 2}: missing required column(s): ${missing.join(", ")}`);
  }
  if (!Number.isFinite(product.price_min) || !Number.isFinite(product.price_max)) {
    throw new Error(`Row ${index + 2}: price_min and price_max must be numbers`);
  }
  if (product.trend_score != null && !Number.isFinite(product.trend_score)) {
    throw new Error(`Row ${index + 2}: trend_score must be a number`);
  }

  return product;
}

async function main() {
  await loadEnvFile(path.join(root, ".env"));
  await loadEnvFile(path.join(root, ".env.local"));

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const help = args.includes("--help") || args.includes("-h");
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const csvPath = path.resolve(root, fileArg ?? DEFAULT_CSV);

  if (help) {
    usage();
    return;
  }

  const raw = await readFile(csvPath, "utf8");
  const parsed = parseCsv(raw);
  if (parsed.length < 2) throw new Error(`CSV needs a header row and at least one product: ${csvPath}`);

  const headers = parsed[0].map((h) => h.trim());
  const products = parsed.slice(1).map((row, index) => rowToProduct(headers, row, index));

  console.log(`Parsed ${products.length} product(s) from ${path.relative(root, csvPath)}`);
  if (dryRun) {
    console.table(products.map((p) => ({ handle: p.handle, title: p.title, brand: p.brand, trend_score: p.trend_score })));
    console.log("Dry run only. Nothing was imported.");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    console.error("Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    console.error("Add SUPABASE_SERVICE_ROLE_KEY to .env.local or your shell environment. Never commit it.");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("catalog_products").upsert(products, { onConflict: "handle" });
  if (error) {
    console.error("Import failed:");
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Imported ${products.length} product(s) into catalog_products.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
