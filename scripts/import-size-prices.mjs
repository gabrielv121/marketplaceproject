#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUOTA_STOP = 900;
const PRIORITY_HANDLE = "nike-air-more-uptempo-black-white-2016";

function parseArgs(argv) {
  const args = { limit: 400, handle: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--limit" && next) {
      args.limit = Number(next);
      i++;
    } else if (arg === "--handle" && next) {
      args.handle = next;
      i++;
    }
  }
  if (!Number.isFinite(args.limit) || args.limit < 1 || args.limit > 2000) {
    throw new Error("--limit must be a number from 1 to 2000");
  }
  return args;
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
    /* optional */
  }
}

function canonicalUsLabel(raw) {
  const match = String(raw ?? "").trim().match(/^US\s+([MW])\s+(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  let num = match[2];
  if (num.endsWith(".0")) num = num.slice(0, -2);
  return `US ${match[1].toUpperCase()} ${num}`;
}

function labelsForVariant(variant) {
  const labels = new Set();
  const sizes = Array.isArray(variant.sizes) ? variant.sizes : [];
  for (const row of sizes) {
    const type = String(row?.type ?? "").toLowerCase();
    if (type !== "us m" && type !== "us w") continue;
    const label = canonicalUsLabel(row?.size);
    if (label) labels.add(label);
  }
  if (!labels.size && variant.size) {
    const type = String(variant.size_type ?? "").toLowerCase();
    const prefix = type.includes("w") && !type.includes("m") ? "US W" : "US M";
    const label = canonicalUsLabel(`${prefix} ${variant.size}`);
    if (label) labels.add(label);
  }
  return [...labels];
}

function asksFromProduct(handle, product) {
  const byLabel = new Map();
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  for (const variant of variants) {
    if (variant.hidden) continue;
    const dollars = Number(variant.lowest_ask);
    if (!Number.isFinite(dollars) || dollars <= 0) continue;
    const cents = Math.round(dollars * 100);
    if (cents <= 0) continue;
    for (const label of labelsForVariant(variant)) {
      const prev = byLabel.get(label);
      if (prev == null || cents < prev) byLabel.set(label, cents);
    }
  }
  return [...byLabel.entries()].map(([size_label, price_cents]) => ({
    product_handle: handle,
    size_label,
    price_cents,
  }));
}

async function fetchProduct(handle, apiKey) {
  const url = new URL(`https://api.kicks.dev/v3/stockx/products/${encodeURIComponent(handle)}`);
  url.searchParams.set("display[variants]", "true");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  const quota = Number(response.headers.get("x-quota-current") ?? "");
  if (response.status === 404) return { missing: true, quota };
  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`KicksDB ${response.status} for ${handle}: ${body.slice(0, 180)}`);
    error.status = response.status;
    error.quota = quota;
    throw error;
  }
  const json = await response.json();
  return { product: json.data ?? json, quota };
}

async function loadHandles(supabase) {
  const rows = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("catalog_products")
      .select("handle")
      .eq("published", true)
      .contains("tags", ["kicksdb"])
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data.map((row) => row.handle));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function loadSynced(supabase) {
  const synced = new Set();
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("platform_size_price_sync")
      .select("product_handle")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) synced.add(row.product_handle);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return synced;
}

async function saveAsks(supabase, handle, rows) {
  const { error: deleteError } = await supabase.from("platform_size_asks").delete().eq("product_handle", handle);
  if (deleteError) throw deleteError;
  if (rows.length) {
    const { error } = await supabase.from("platform_size_asks").insert(rows);
    if (error) throw error;
  }
  const { error: syncError } = await supabase.from("platform_size_price_sync").upsert({
    product_handle: handle,
    synced_at: new Date().toISOString(),
    source: "kicksdb",
  });
  if (syncError) throw syncError;
}

async function main() {
  await loadEnvFile(path.join(root, ".env"));
  await loadEnvFile(path.join(root, ".env.local"));
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.KICKSDB_API_KEY ?? process.env.KICKSDEV_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !supabaseUrl || !serviceRole) {
    console.error("Missing KICKSDB_API_KEY, Supabase URL, or SUPABASE_SERVICE_ROLE_KEY.");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const synced = await loadSynced(supabase);
  const handles = await loadHandles(supabase);
  const queue = [];
  const priority = args.handle || PRIORITY_HANDLE;
  if (priority && !synced.has(priority)) queue.push(priority);
  for (const handle of handles) {
    if (handle === priority || synced.has(handle)) continue;
    queue.push(handle);
  }

  console.log(`Size-price queue: ${queue.length} unsynced. This run will fetch up to ${args.limit}.`);
  let fetched = 0;
  let priced = 0;
  let missing = 0;
  for (const handle of queue) {
    if (fetched >= args.limit) break;
    try {
      const result = await fetchProduct(handle, apiKey);
      fetched += 1;
      if (Number.isFinite(result.quota) && result.quota >= QUOTA_STOP) {
        console.log(`Stopping at quota ${result.quota}.`);
        break;
      }
      if (result.missing) {
        missing += 1;
        console.log(`Missing on KicksDB: ${handle}`);
        continue;
      }
      const variants = Array.isArray(result.product?.variants) ? result.product.variants : [];
      if (!variants.length) {
        console.log(`No size data returned for ${handle}`);
        continue;
      }
      const rows = asksFromProduct(handle, result.product);
      await saveAsks(supabase, handle, rows);
      priced += 1;
      if (fetched === 1 || fetched % 25 === 0) {
        const sample = rows
          .filter((row) => row.size_label.startsWith("US M "))
          .slice(0, 6)
          .map((row) => `${row.size_label} $${Math.round(row.price_cents / 100)}`)
          .join(", ");
        console.log(`${fetched} fetched, ${priced} priced, quota ${result.quota || "?"}. ${handle}: ${rows.length} sizes. ${sample}`);
      }
    } catch (error) {
      const status = error?.status;
      console.error(error instanceof Error ? error.message : error);
      if (status === 401 || status === 403 || status === 429 || status >= 500) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  console.log(`Done. Fetched ${fetched}, stored ${priced}, missing ${missing}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
