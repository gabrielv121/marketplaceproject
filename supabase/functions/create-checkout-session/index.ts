import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = { trade_id?: string; site_url?: string };

type CatalogProduct = {
  title: string | null;
  brand: string | null;
  description: string | null;
  featured_image_url: string | null;
};

function cleanText(value: string | null | undefined, fallback: string): string {
  const text = value?.replace(/\s+/g, " ").trim();
  return text || fallback;
}

function checkoutImage(url: string | null | undefined): string[] | undefined {
  const image = url?.trim();
  if (!image || !image.startsWith("https://")) return undefined;
  return [image];
}

function envCents(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const parsed = raw == null ? fallback : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function envBps(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const parsed = raw == null ? fallback : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(10000, Math.max(0, Math.trunc(parsed)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !supabaseUrl || !supabaseAnon || !serviceRole) {
    return new Response(
      JSON.stringify({
        error: "Missing server secrets (STRIPE_SECRET_KEY, SUPABASE_*). Set Edge Function secrets in the dashboard.",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tradeId = body.trade_id?.trim();
  if (!tradeId) {
    return new Response(JSON.stringify({ error: "trade_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRole);

  const { data: trade, error: tradeErr } = await admin
    .from("p2p_trades")
    .select("id, buyer_id, seller_id, product_handle, size_label, price_cents, currency, status, stripe_checkout_session_id")
    .eq("id", tradeId)
    .maybeSingle();

  if (tradeErr || !trade) {
    return new Response(JSON.stringify({ error: "Trade not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (trade.buyer_id !== user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (trade.status !== "reserved" && trade.status !== "pending_payment") {
    return new Response(JSON.stringify({ error: "Trade is not awaiting payment" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const siteUrl = (body.site_url ?? Deno.env.get("CHECKOUT_SITE_URL") ?? "").replace(/\/$/, "");
  if (!siteUrl || !siteUrl.startsWith("http")) {
    return new Response(
      JSON.stringify({
        error: "Set CHECKOUT_SITE_URL secret (e.g. https://yourapp.com) or pass site_url in the request body.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const buyerShippingCents = envCents("BUYER_SHIPPING_CENTS", 1495);
  const buyerProcessingFeeBps = envBps("BUYER_PROCESSING_FEE_BPS", 300);
  const buyerProcessingFeeCents = Math.floor((trade.price_cents * buyerProcessingFeeBps) / 10000);
  const sellerInboundLabelCents = envCents("SELLER_INBOUND_LABEL_CENTS", 995);
  const sellerFeeBps = envBps("SELLER_FEE_BPS", envBps("PLATFORM_FEE_BPS", 900));
  const sellerFeeCents = Math.floor((trade.price_cents * sellerFeeBps) / 10000);
  const sellerNetPayoutCents = Math.max(trade.price_cents - sellerFeeCents - sellerInboundLabelCents, 0);
  const buyerTotalCents = trade.price_cents + buyerShippingCents + buyerProcessingFeeCents;
  const pricingVersion = "shipping-fees-v2";

  const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });

  if (trade.stripe_checkout_session_id) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(trade.stripe_checkout_session_id);
      const stillOpen =
        existing.status === "open" &&
        existing.url &&
        existing.metadata?.pricing_version === pricingVersion &&
        existing.metadata?.buyer_shipping_cents === String(buyerShippingCents) &&
        existing.metadata?.buyer_processing_fee_cents === String(buyerProcessingFeeCents) &&
        (existing.expires_at ?? 0) > Math.floor(Date.now() / 1000);
      if (stillOpen) {
        return new Response(JSON.stringify({ url: existing.url }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch {
      // If Stripe no longer knows this session, create a fresh one below.
    }
  }

  const currency = String(trade.currency ?? "USD").toLowerCase();
  const { data: catalogProduct } = await admin
    .from("catalog_products")
    .select("title, brand, description, featured_image_url")
    .eq("handle", trade.product_handle)
    .maybeSingle<CatalogProduct>();

  const productTitle = cleanText(catalogProduct?.title, trade.product_handle);
  const productBrand = cleanText(catalogProduct?.brand, "EXCH.");
  const productDescription = cleanText(
    catalogProduct?.description,
    "EXCH. holds your payment while the seller ships the item to us for verification.",
  );

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: trade.id,
      customer_email: user.email ?? undefined,
      billing_address_collection: "auto",
      phone_number_collection: { enabled: true },
      payment_method_types: ["card"],
      allow_promotion_codes: true,
      shipping_address_collection: {
        allowed_countries: ["US", "CA"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: buyerShippingCents, currency },
            display_name: "EXCH. verified delivery",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 5 },
              maximum: { unit: "business_day", value: 10 },
            },
          },
        },
      ],
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: trade.price_cents,
            product_data: {
              name: `${productTitle} — ${trade.size_label}`,
              description: `${productBrand} • ${productDescription}`.slice(0, 1000),
              images: checkoutImage(catalogProduct?.featured_image_url),
              metadata: { trade_id: trade.id, product_handle: trade.product_handle },
            },
          },
          quantity: 1,
        },
        ...(buyerProcessingFeeCents > 0
          ? [
              {
                price_data: {
                  currency,
                  unit_amount: buyerProcessingFeeCents,
                  product_data: {
                    name: "Processing fee",
                    description: "Payment and order processing",
                  },
                },
                quantity: 1,
              },
            ]
          : []),
      ],
      payment_intent_data: {
        metadata: {
          trade_id: trade.id,
          buyer_id: trade.buyer_id,
          seller_id: trade.seller_id,
          held_for_verification: "true",
          buyer_shipping_cents: String(buyerShippingCents),
          buyer_processing_fee_cents: String(buyerProcessingFeeCents),
          seller_inbound_label_cents: String(sellerInboundLabelCents),
          seller_fee_cents: String(sellerFeeCents),
          seller_net_payout_cents: String(sellerNetPayoutCents),
        },
      },
      metadata: {
        trade_id: trade.id,
        held_for_verification: "true",
        pricing_version: pricingVersion,
        buyer_shipping_cents: String(buyerShippingCents),
        buyer_processing_fee_bps: String(buyerProcessingFeeBps),
        buyer_processing_fee_cents: String(buyerProcessingFeeCents),
        buyer_total_cents: String(buyerTotalCents),
        seller_inbound_label_cents: String(sellerInboundLabelCents),
        seller_fee_bps: String(sellerFeeBps),
        seller_fee_cents: String(sellerFeeCents),
        seller_net_payout_cents: String(sellerNetPayoutCents),
      },
      custom_text: {
        shipping_address: {
          message: "Ship-to address is used after EXCH. verifies the item.",
        },
        submit: {
          message:
            "Processing fee and shipping are shown above. Your payment is held until the item passes verification and is delivered.",
        },
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${siteUrl}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/account?checkout=cancel&trade_id=${trade.id}`,
    });

    await admin
      .from("p2p_trades")
      .update({
        stripe_checkout_session_id: session.id,
        buyer_shipping_cents: buyerShippingCents,
        buyer_processing_fee_bps: buyerProcessingFeeBps,
        buyer_processing_fee_cents: buyerProcessingFeeCents,
        seller_inbound_label_cents: sellerInboundLabelCents,
        seller_fee_bps: sellerFeeBps,
        seller_fee_cents: sellerFeeCents,
        seller_net_payout_cents: sellerNetPayoutCents,
        buyer_total_cents: buyerTotalCents,
      })
      .eq("id", trade.id)
      .in("status", ["reserved", "pending_payment"]);

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
