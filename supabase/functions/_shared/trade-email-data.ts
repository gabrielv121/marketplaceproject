import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  type EmailProductCard,
  type OrderDetailRow,
  type RelatedEmailProduct,
  formatMoney,
  formatOrderId,
} from "./email-template.ts";

export { formatMoney, formatOrderId } from "./email-template.ts";

export function resolveSiteUrl(siteUrl?: string | null): string {
  const fromBody = siteUrl?.trim().replace(/\/$/, "");
  if (fromBody) return fromBody;
  const fromEnv = (Deno.env.get("CHECKOUT_SITE_URL") ?? Deno.env.get("SITE_URL") ?? "").trim().replace(/\/$/, "");
  return fromEnv || "https://example.com";
}

export function appUrl(path = "/account", siteUrl?: string | null): string {
  return `${resolveSiteUrl(siteUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function emailForUser(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    console.error("email lookup failed", userId, error);
    return null;
  }
  return data.user?.email ?? null;
}

export type CatalogProductEmail = {
  title: string;
  brand: string | null;
  featured_image_url: string | null;
  department_slug?: string | null;
};

export async function loadCatalogProduct(
  admin: SupabaseClient,
  productHandle: string,
): Promise<CatalogProductEmail> {
  const { data } = await admin
    .from("catalog_products")
    .select("title, brand, featured_image_url, department_slug")
    .eq("handle", productHandle)
    .maybeSingle<{
      title: string;
      brand: string | null;
      featured_image_url: string | null;
      department_slug: string | null;
    }>();

  return {
    title: data?.title?.trim() || productHandle,
    brand: data?.brand?.trim() || null,
    featured_image_url: data?.featured_image_url?.trim() || null,
    department_slug: data?.department_slug?.trim() || null,
  };
}

export function buildProductCard(
  catalog: CatalogProductEmail,
  productHandle: string,
  sizeLabel: string,
  siteUrl: string,
): EmailProductCard {
  const base = siteUrl.replace(/\/$/, "");
  return {
    title: catalog.title,
    brand: catalog.brand,
    handle: productHandle,
    sizeLabel,
    imageUrl: catalog.featured_image_url,
    productUrl: `${base}/product/${productHandle}`,
    siteUrl: base,
  };
}

export function baseOrderRows(input: {
  tradeId?: string;
  sizeLabel: string;
  priceLabel?: string;
  extra?: OrderDetailRow[];
}): OrderDetailRow[] {
  const rows: OrderDetailRow[] = [];
  if (input.tradeId) rows.push({ label: "Order", value: formatOrderId(input.tradeId) });
  rows.push({ label: "Size", value: input.sizeLabel });
  if (input.priceLabel) rows.push({ label: "Amount", value: input.priceLabel });
  if (input.extra) rows.push(...input.extra);
  return rows;
}

export function buyerChargeRows(input: {
  tradeId: string;
  sizeLabel: string;
  currency: string;
  priceCents: number;
  processingFeeCents?: number | null;
  shippingCents?: number | null;
  totalCents?: number | null;
}): OrderDetailRow[] {
  const currency = input.currency || "USD";
  const processing = input.processingFeeCents ?? 0;
  const shipping = input.shippingCents ?? 0;
  const total =
    input.totalCents != null && input.totalCents > 0
      ? input.totalCents
      : input.priceCents + processing + shipping;

  const rows: OrderDetailRow[] = [
    { label: "Order", value: formatOrderId(input.tradeId) },
    { label: "Size", value: input.sizeLabel },
    { label: "Item", value: formatMoney(input.priceCents, currency) },
  ];
  if (processing > 0) rows.push({ label: "Processing fee", value: formatMoney(processing, currency) });
  if (shipping > 0) rows.push({ label: "Shipping", value: formatMoney(shipping, currency) });
  rows.push({ label: "Total", value: formatMoney(total, currency), emphasis: true });
  return rows;
}

export async function loadProductCard(
  admin: SupabaseClient,
  productHandle: string,
  sizeLabel: string,
  siteUrl: string,
): Promise<EmailProductCard> {
  const catalog = await loadCatalogProduct(admin, productHandle);
  return buildProductCard(catalog, productHandle, sizeLabel, siteUrl);
}

type RelatedCatalogRow = {
  handle: string;
  title: string;
  brand: string | null;
  featured_image_url: string | null;
};

function toRelatedProduct(row: RelatedCatalogRow, siteUrl: string): RelatedEmailProduct {
  const base = siteUrl.replace(/\/$/, "");
  return {
    title: row.title?.trim() || row.handle,
    brand: row.brand?.trim() || null,
    handle: row.handle,
    imageUrl: row.featured_image_url?.trim() || null,
    productUrl: `${base}/product/${row.handle}`,
  };
}

/** Same-brand first, then same department, then trending fill — excludes the purchased handle. */
export async function loadRelatedProducts(
  admin: SupabaseClient,
  productHandle: string,
  siteUrl: string,
  limit = 3,
): Promise<RelatedEmailProduct[]> {
  const purchased = await loadCatalogProduct(admin, productHandle);
  const picked = new Map<string, RelatedEmailProduct>();
  const exclude = new Set([productHandle]);

  const pushRows = (rows: RelatedCatalogRow[] | null | undefined) => {
    for (const row of rows ?? []) {
      if (picked.size >= limit) break;
      if (exclude.has(row.handle)) continue;
      exclude.add(row.handle);
      picked.set(row.handle, toRelatedProduct(row, siteUrl));
    }
  };

  if (purchased.brand) {
    const { data } = await admin
      .from("catalog_products")
      .select("handle, title, brand, featured_image_url")
      .eq("published", true)
      .ilike("brand", purchased.brand)
      .neq("handle", productHandle)
      .not("featured_image_url", "is", null)
      .order("trend_score", { ascending: false, nullsFirst: false })
      .limit(limit * 2);
    pushRows(data as RelatedCatalogRow[] | null);
  }

  if (picked.size < limit && purchased.department_slug) {
    const { data } = await admin
      .from("catalog_products")
      .select("handle, title, brand, featured_image_url")
      .eq("published", true)
      .eq("department_slug", purchased.department_slug)
      .neq("handle", productHandle)
      .not("featured_image_url", "is", null)
      .order("trend_score", { ascending: false, nullsFirst: false })
      .limit(limit * 3);
    pushRows(data as RelatedCatalogRow[] | null);
  }

  if (picked.size < limit) {
    const { data } = await admin
      .from("catalog_products")
      .select("handle, title, brand, featured_image_url")
      .eq("published", true)
      .neq("handle", productHandle)
      .not("featured_image_url", "is", null)
      .order("trend_score", { ascending: false, nullsFirst: false })
      .limit(limit * 3);
    pushRows(data as RelatedCatalogRow[] | null);
  }

  return [...picked.values()].slice(0, limit);
}
