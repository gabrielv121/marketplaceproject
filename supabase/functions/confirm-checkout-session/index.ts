import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { sendNotificationEmail } from "../_shared/send-notification-email.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = { session_id?: string };

type PaidTrade = {
  listing_id: string | null;
  buyer_id: string;
  seller_id: string;
  product_handle: string;
  size_label: string;
  currency: string;
  buyer_total_cents: number | null;
  seller_net_payout_cents: number | null;
  seller_ship_by: string | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function appUrl(path = "/account"): string {
  return `${(Deno.env.get("CHECKOUT_SITE_URL") ?? "").replace(/\/$/, "")}${path}`;
}

function money(cents: number | null | undefined, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents ?? 0) / 100);
}

function buyerShippingPatch(session: Stripe.Checkout.Session): Record<string, string | null> {
  const details = session.customer_details;
  const address = details?.address;

  return {
    buyer_shipping_name: details?.name ?? null,
    buyer_shipping_email: details?.email ?? null,
    buyer_shipping_phone: details?.phone ?? null,
    buyer_shipping_line1: address?.line1 ?? null,
    buyer_shipping_line2: address?.line2 ?? null,
    buyer_shipping_city: address?.city ?? null,
    buyer_shipping_state: address?.state ?? null,
    buyer_shipping_postal_code: address?.postal_code ?? null,
    buyer_shipping_country: address?.country ?? null,
  };
}

async function emailForUser(admin: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    console.error("email lookup failed", userId, error);
    return null;
  }
  return data.user?.email ?? null;
}

async function sendPaymentEmails(admin: ReturnType<typeof createClient>, trade: PaidTrade): Promise<void> {
  const [buyerEmail, sellerEmail] = await Promise.all([
    emailForUser(admin, trade.buyer_id),
    emailForUser(admin, trade.seller_id),
  ]);
  const product = `${trade.product_handle} (${trade.size_label})`;
  const accountLink = appUrl("/account");
  const shipBy = trade.seller_ship_by ? new Date(trade.seller_ship_by).toLocaleDateString("en-US") : "within 3 days";

  await Promise.all([
    sendNotificationEmail(
      {
        to: buyerEmail,
        subject: `EXCH. order received: ${product}`,
        html: `<p>Your payment for <strong>${product}</strong> was received.</p><p>EXCH. is holding ${money(trade.buyer_total_cents, trade.currency)} while the seller ships the item to us for verification.</p><p><a href="${accountLink}">View your order</a></p>`,
        text: `Your payment for ${product} was received. EXCH. is holding ${money(trade.buyer_total_cents, trade.currency)} while the seller ships the item to us for verification. View your order: ${accountLink}`,
      },
      { silentSkip: true },
    ),
    sendNotificationEmail(
      {
        to: sellerEmail,
        subject: `Action needed: ship ${product} to EXCH.`,
        html: `<p>Your item <strong>${product}</strong> sold.</p><p>Please create/use the prepaid label in your EXCH. account and ship the item to us by ${shipBy}. Your estimated payout is ${money(trade.seller_net_payout_cents, trade.currency)} after verification and buyer delivery.</p><p><a href="${accountLink}">Open seller actions</a></p>`,
        text: `Your item ${product} sold. Please create/use the prepaid label in your EXCH. account and ship the item to us by ${shipBy}. Estimated payout: ${money(trade.seller_net_payout_cents, trade.currency)}. Open seller actions: ${accountLink}`,
      },
      { silentSkip: true },
    ),
  ]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const stripeKey = requiredEnv("STRIPE_SECRET_KEY");
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const supabaseAnon = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const sessionId = body.session_id?.trim();
    if (!sessionId) return json({ error: "session_id required" }, 400);

    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    if (session.payment_status !== "paid") {
      return json({ error: `Checkout session is ${session.payment_status}, not paid.` }, 400);
    }

    const tradeId = session.metadata?.trade_id;
    if (!tradeId) return json({ error: "Checkout session is missing trade_id metadata" }, 400);

    const admin = createClient(supabaseUrl, serviceRole);
    const { data: existing, error: existingErr } = await admin
      .from("p2p_trades")
      .select("id, buyer_id, status")
      .eq("id", tradeId)
      .maybeSingle<{ id: string; buyer_id: string; status: string }>();

    if (existingErr) return json({ error: existingErr.message }, 500);
    if (!existing) return json({ error: "Trade not found" }, 404);
    if (existing.buyer_id !== user.id) return json({ error: "Forbidden" }, 403);
    if (!["reserved", "pending_payment"].includes(existing.status)) {
      return json({ ok: true, status: existing.status, already_confirmed: true });
    }

    const paymentIntent = session.payment_intent;
    const paymentIntentId = typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null;
    const latestCharge = typeof paymentIntent === "string" ? null : paymentIntent?.latest_charge;
    const chargeId = typeof latestCharge === "string" ? latestCharge : latestCharge?.id ?? null;
    const sellerShipBy = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: trade, error: updateErr } = await admin
      .from("p2p_trades")
      .update({
        status: "seller_notified",
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        stripe_charge_id: chargeId,
        stripe_amount_total_cents: session.amount_total,
        stripe_amount_shipping_cents: session.total_details?.amount_shipping ?? 0,
        ...buyerShippingPatch(session),
        paid_at: new Date().toISOString(),
        seller_notified_at: new Date().toISOString(),
        seller_ship_by: sellerShipBy,
      })
      .eq("id", tradeId)
      .in("status", ["reserved", "pending_payment"])
      .select("listing_id, buyer_id, seller_id, product_handle, size_label, currency, buyer_total_cents, seller_net_payout_cents, seller_ship_by")
      .maybeSingle<PaidTrade>();

    if (updateErr) return json({ error: updateErr.message }, 500);
    if (!trade) return json({ ok: true, status: "already_confirmed" });

    if (trade.listing_id) {
      const { error: listingErr } = await admin
        .from("p2p_listings")
        .update({ status: "sold" })
        .eq("id", trade.listing_id)
        .eq("status", "reserved");
      if (listingErr) return json({ error: listingErr.message }, 500);
    }

    await sendPaymentEmails(admin, trade);

    return json({ ok: true, status: "seller_notified", trade_id: tradeId });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
