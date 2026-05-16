import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { renderOrderEmail } from "./email-template.ts";
import { sendNotificationEmail, tryNotificationEmail } from "./send-notification-email.ts";
import {
  appUrl,
  baseOrderRows,
  emailForUser,
  formatMoney,
  loadProductCard,
  resolveSiteUrl,
} from "./trade-email-data.ts";

async function sendTemplated(
  to: string | null | undefined,
  subject: string,
  content: Parameters<typeof renderOrderEmail>[0],
): Promise<void> {
  const { html, text } = renderOrderEmail(content);
  await sendNotificationEmail({ to, subject, html, text }, { silentSkip: true });
}

export type PaymentTrade = {
  id: string;
  buyer_id: string;
  seller_id: string;
  product_handle: string;
  size_label: string;
  currency: string;
  buyer_total_cents: number | null;
  seller_net_payout_cents: number | null;
  seller_ship_by: string | null;
};

export async function sendPaymentReceivedEmails(admin: SupabaseClient, trade: PaymentTrade): Promise<void> {
  const siteUrl = resolveSiteUrl(null);
  const [buyerEmail, sellerEmail, product] = await Promise.all([
    emailForUser(admin, trade.buyer_id),
    emailForUser(admin, trade.seller_id),
    loadProductCard(admin, trade.product_handle, trade.size_label, siteUrl),
  ]);
  const accountLink = appUrl("/account", siteUrl);
  const shipBy = trade.seller_ship_by
    ? new Date(trade.seller_ship_by).toLocaleDateString("en-US")
    : "within 3 days";
  const total = formatMoney(trade.buyer_total_cents, trade.currency);
  const payout = formatMoney(trade.seller_net_payout_cents, trade.currency);
  const rows = baseOrderRows({
    tradeId: trade.id,
    sizeLabel: trade.size_label,
    priceLabel: total,
  });

  await Promise.all([
    sendTemplated(buyerEmail, `Order confirmed — ${product.title}`, {
      preheader: `Payment received for ${product.title}`,
      headline: "Payment received",
      paragraphs: [
        `Thanks for your purchase. EXCH. is holding ${total} while the seller ships the item to us for verification.`,
      ],
      product,
      orderRows: rows,
      cta: { label: "View your order", href: accountLink },
    }),
    sendTemplated(sellerEmail, `Ship to EXCH. — ${product.title}`, {
      preheader: `Your ${product.title} sold — ship by ${shipBy}`,
      headline: "Your item sold",
      paragraphs: [
        `Create or use your prepaid label in your account and ship this item to EXCH. by ${shipBy}.`,
        `Estimated payout after verification and delivery: ${payout}.`,
      ],
      product,
      orderRows: rows,
      cta: { label: "Open seller actions", href: accountLink },
    }),
  ]);
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
  const origin = resolveSiteUrl(siteUrl);
  const [buyerEmail, sellerEmail, product] = await Promise.all([
    emailForUser(admin, trade.buyer_id),
    emailForUser(admin, trade.seller_id),
    loadProductCard(admin, trade.product_handle, trade.size_label, origin),
  ]);
  const amountCents =
    trade.buyer_total_cents && trade.buyer_total_cents > 0 ? trade.buyer_total_cents : trade.price_cents;
  const priceLabel = formatMoney(amountCents, trade.currency);
  const rows = baseOrderRows({ tradeId: trade.id, sizeLabel: trade.size_label, priceLabel });

  await Promise.all([
    sendTemplated(buyerEmail, `Bid matched — ${product.title}`, {
      preheader: `Complete checkout for ${product.title} at ${priceLabel}`,
      headline: "Your bid matched",
      paragraphs: [
        "Your bid matched an active listing. Complete checkout to secure the item — payment is held by EXCH. until verification.",
      ],
      product,
      orderRows: rows,
      cta: { label: "Complete checkout", href: appUrl("/account#buying", origin) },
    }),
    sendTemplated(sellerEmail, `Bid matched your listing — ${product.title}`, {
      preheader: `A buyer matched your listing at ${priceLabel}`,
      headline: "Bid matched your listing",
      paragraphs: [
        "A buyer's bid matched your listing. They have been emailed to complete checkout.",
        "You will receive another email once payment is received.",
      ],
      product,
      orderRows: rows,
      cta: { label: "View selling", href: appUrl("/account#selling", origin) },
    }),
  ]);
}

export type StatusTrade = {
  id: string;
  buyer_id: string;
  seller_id: string;
  product_handle: string;
  size_label: string;
  currency: string;
  price_cents: number;
  seller_net_payout_cents: number | null;
  buyer_tracking_number: string | null;
};

export async function sendTradeStatusEmails(
  admin: SupabaseClient,
  status: string,
  trade: StatusTrade,
): Promise<void> {
  const siteUrl = resolveSiteUrl(null);
  const [buyerEmail, sellerEmail, product] = await Promise.all([
    emailForUser(admin, trade.buyer_id),
    emailForUser(admin, trade.seller_id),
    loadProductCard(admin, trade.product_handle, trade.size_label, siteUrl),
  ]);
  const accountLink = appUrl("/account", siteUrl);
  const rows = baseOrderRows({
    tradeId: trade.id,
    sizeLabel: trade.size_label,
    priceLabel: formatMoney(trade.price_cents, trade.currency),
  });

  if (status === "verification_passed") {
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", trade.seller_id)
      .maybeSingle<{ stripe_account_id: string | null }>();
    const hasStripe = Boolean(profile?.stripe_account_id?.trim());
    const sellerParagraphs = hasStripe
      ? ["EXCH. will ship the item to the buyer next.", "Your payout will become available after buyer delivery."]
      : [
          "EXCH. will ship the item to the buyer next.",
          "Connect Stripe in your account so we can release your payout after delivery.",
        ];

    await Promise.all([
      sendTemplated(buyerEmail, `Verified — ${product.title}`, {
        preheader: "Your order passed EXCH. verification",
        headline: "Verification passed",
        paragraphs: ["Your order passed EXCH. authentication. We will ship it to you next."],
        product,
        orderRows: rows,
        cta: { label: "Track your order", href: accountLink },
      }),
      sendTemplated(sellerEmail, `Verified — ${product.title}`, {
        preheader: "Your sale passed verification",
        headline: "Verification passed",
        paragraphs: sellerParagraphs,
        product,
        orderRows: rows,
        cta: { label: hasStripe ? "View sale" : "Connect Stripe", href: accountLink },
      }),
    ]);
    return;
  }

  if (status === "verification_failed") {
    await Promise.all([
      sendTemplated(buyerEmail, `Verification update — ${product.title}`, {
        preheader: "Your order did not pass verification",
        headline: "Verification did not pass",
        paragraphs: ["The item did not pass EXCH. verification. We will handle the refund process."],
        product,
        orderRows: rows,
        cta: { label: "View order", href: accountLink },
      }),
      sendTemplated(sellerEmail, `Verification failed — ${product.title}`, {
        preheader: "Your item did not pass verification",
        headline: "Verification did not pass",
        paragraphs: ["Your item did not pass verification. EXCH. will follow up about return or next steps."],
        product,
        orderRows: rows,
        cta: { label: "View sale", href: accountLink },
      }),
    ]);
    return;
  }

  if (status === "shipped_to_buyer") {
    const tracking = trade.buyer_tracking_number?.trim();
    const extra = tracking ? [{ label: "Tracking", value: tracking }] : [];
    await sendTemplated(buyerEmail, `On the way — ${product.title}`, {
      preheader: "Your verified order has shipped",
      headline: "Your order is on the way",
      paragraphs: ["Your verified order has left EXCH. and is heading to you."],
      product,
      orderRows: [...rows, ...extra],
      cta: { label: "View your order", href: accountLink },
    });
    return;
  }

  if (status === "delivered_to_buyer") {
    await Promise.all([
      sendTemplated(buyerEmail, `Delivered — ${product.title}`, {
        preheader: "Your EXCH. order was delivered",
        headline: "Order delivered",
        paragraphs: ["Your order was delivered. Thanks for shopping on EXCH."],
        product,
        orderRows: rows,
        cta: { label: "View your order", href: accountLink },
      }),
      sendTemplated(sellerEmail, `Buyer received — ${product.title}`, {
        preheader: "The buyer received your item",
        headline: "Buyer received your item",
        paragraphs: [
          "The buyer received your item.",
          "EXCH. will mark your payout available next — you will get another email when funds are ready to release.",
        ],
        product,
        orderRows: rows,
        cta: { label: "View sale", href: accountLink },
      }),
    ]);
    return;
  }

  if (status === "payout_available") {
    const payout = formatMoney(trade.seller_net_payout_cents, trade.currency);
    await sendTemplated(sellerEmail, `Payout available — ${product.title}`, {
      preheader: `Your payout of ${payout} is ready`,
      headline: "Payout available",
      paragraphs: [`Your payout for this sale is now available. Estimated amount: ${payout}.`],
      product,
      orderRows: [
        ...rows,
        { label: "Estimated payout", value: payout },
      ],
      cta: { label: "View payout", href: accountLink },
    });
  }
}

export async function sendShippingLabelEmail(params: {
  to?: string | null;
  productHandle: string;
  sizeLabel: string;
  tradeId?: string;
  labelUrl: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  service?: string | null;
  admin?: SupabaseClient;
}): Promise<{ sent: boolean; error?: string }> {
  const siteUrl = resolveSiteUrl(null);
  const product = params.admin
    ? await loadProductCard(params.admin, params.productHandle, params.sizeLabel, siteUrl)
    : {
        title: params.productHandle,
        brand: null,
        handle: params.productHandle,
        sizeLabel: params.sizeLabel,
        imageUrl: null,
        productUrl: `${siteUrl}/product/${params.productHandle}`,
        siteUrl,
      };

  const extra: { label: string; value: string }[] = [];
  if (params.trackingNumber) extra.push({ label: "Tracking", value: params.trackingNumber });
  const carrier = [params.carrier, params.service].filter(Boolean).join(" · ");
  if (carrier) extra.push({ label: "Carrier", value: carrier });

  const { html, text } = renderOrderEmail({
    preheader: `Prepaid label ready for ${product.title}`,
    headline: "Your shipping label is ready",
    paragraphs: [
      "Print the label, attach it to your package, and ship the item to EXCH. for verification.",
    ],
    product,
    orderRows: baseOrderRows({
      tradeId: params.tradeId,
      sizeLabel: params.sizeLabel,
      extra,
    }),
    cta: { label: "Download shipping label", href: params.labelUrl },
    secondaryCta: { label: "Open your account", href: appUrl("/account", siteUrl) },
  });

  return tryNotificationEmail({
    to: params.to,
    subject: `Shipping label — ${product.title}`,
    html,
    text,
  });
}

export async function sendBuyerShippedEmail(params: {
  to?: string | null;
  productHandle: string;
  sizeLabel: string;
  tradeId?: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  service?: string | null;
  admin: SupabaseClient;
}): Promise<void> {
  const siteUrl = resolveSiteUrl(null);
  const product = await loadProductCard(params.admin, params.productHandle, params.sizeLabel, siteUrl);
  const extra: { label: string; value: string }[] = [];
  if (params.trackingNumber) extra.push({ label: "Tracking", value: params.trackingNumber });
  const carrier = [params.carrier, params.service].filter(Boolean).join(" · ");
  if (carrier) extra.push({ label: "Carrier", value: carrier });

  await sendTemplated(params.to, `Shipped — ${product.title}`, {
    preheader: "Your verified order is on the way",
    headline: "Your order is on the way",
    paragraphs: ["Your verified order has shipped from EXCH. and is heading to you."],
    product,
    orderRows: baseOrderRows({
      tradeId: params.tradeId,
      sizeLabel: params.sizeLabel,
      extra,
    }),
    cta: { label: "View your order", href: appUrl("/account", siteUrl) },
  });
}
