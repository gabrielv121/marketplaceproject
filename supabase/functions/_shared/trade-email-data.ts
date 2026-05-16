import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  type EmailProductCard,
  type OrderDetailRow,
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
};

export async function loadCatalogProduct(
  admin: SupabaseClient,
  productHandle: string,
): Promise<CatalogProductEmail> {
  const { data } = await admin
    .from("catalog_products")
    .select("title, brand, featured_image_url")
    .eq("handle", productHandle)
    .maybeSingle<{ title: string; brand: string | null; featured_image_url: string | null }>();

  return {
    title: data?.title?.trim() || productHandle,
    brand: data?.brand?.trim() || null,
    featured_image_url: data?.featured_image_url?.trim() || null,
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

export async function loadProductCard(
  admin: SupabaseClient,
  productHandle: string,
  sizeLabel: string,
  siteUrl: string,
): Promise<EmailProductCard> {
  const catalog = await loadCatalogProduct(admin, productHandle);
  return buildProductCard(catalog, productHandle, sizeLabel, siteUrl);
}
