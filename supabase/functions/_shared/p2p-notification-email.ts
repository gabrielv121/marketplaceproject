import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendNotificationEmail } from "./send-notification-email.ts";

export function money(cents: number | null | undefined, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents ?? 0) / 100);
}

export function resolveSiteUrl(siteUrl?: string | null): string {
  const fromBody = siteUrl?.trim().replace(/\/$/, "");
  if (fromBody) return fromBody;
  const fromEnv = (Deno.env.get("CHECKOUT_SITE_URL") ?? Deno.env.get("SITE_URL") ?? "").trim().replace(/\/$/, "");
  return fromEnv || "https://example.com";
}

export async function emailForUser(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    console.error("email lookup failed", userId, error);
    return null;
  }
  return data.user?.email ?? null;
}

export async function catalogTitle(
  admin: SupabaseClient,
  productHandle: string,
): Promise<string> {
  const { data } = await admin
    .from("catalog_products")
    .select("title")
    .eq("handle", productHandle)
    .maybeSingle<{ title: string }>();
  return data?.title?.trim() || productHandle;
}

export type BidMatchTrade = {
  id: string;
  buyer_id: string;
  seller_id: string;
  product_handle: string;
  size_label: string;
  price_cents: number;
  currency: string;
  buyer_total_cents: number | null;
};

export async function sendBidMatchEmails(
  admin: SupabaseClient,
  trade: BidMatchTrade,
  siteUrl: string,
): Promise<void> {
  const [buyerEmail, sellerEmail, title] = await Promise.all([
    emailForUser(admin, trade.buyer_id),
    emailForUser(admin, trade.seller_id),
    catalogTitle(admin, trade.product_handle),
  ]);

  const product = `${title} — size ${trade.size_label}`;
  const amountCents =
    trade.buyer_total_cents && trade.buyer_total_cents > 0
      ? trade.buyer_total_cents
      : trade.price_cents;
  const priceLabel = money(amountCents, trade.currency);
  const accountBuying = `${siteUrl}/account#buying`;
  const accountSelling = `${siteUrl}/account#selling`;

  await Promise.all([
    sendNotificationEmail(
      {
        to: buyerEmail,
        subject: `Your bid matched: ${title}`,
        html: `<p>Your bid matched <strong>${product}</strong> at <strong>${priceLabel}</strong>.</p><p>Complete checkout to secure the item. Payment is held by EXCH. until verification.</p><p><a href="${accountBuying}">Complete checkout</a></p>`,
        text: `Your bid matched ${product} at ${priceLabel}. Complete checkout to secure the item: ${accountBuying}`,
      },
      { silentSkip: true },
    ),
    sendNotificationEmail(
      {
        to: sellerEmail,
        subject: `Bid matched your listing: ${title}`,
        html: `<p>A buyer's bid matched your listing for <strong>${product}</strong> at <strong>${priceLabel}</strong>.</p><p>The buyer has been emailed to complete checkout. You will be notified again once payment is received.</p><p><a href="${accountSelling}">View selling</a></p>`,
        text: `A buyer's bid matched your listing for ${product} at ${priceLabel}. The buyer will complete checkout shortly. View selling: ${accountSelling}`,
      },
      { silentSkip: true },
    ),
  ]);
}
