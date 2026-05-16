import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { sendPaymentReceivedEmails } from "../_shared/order-emails.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

Deno.serve(async (req) => {
  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceRole) {
    return new Response("Missing Stripe or Supabase secrets", { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const body = await req.text();
  const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Webhook signature error: ${msg}`, { status: 400 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const admin = createClient(supabaseUrl, serviceRole);

  if (event.type === "checkout.session.expired") {
    const { error } = await admin.rpc("expire_reserved_trade_by_session", {
      p_stripe_checkout_session_id: session.id,
    });

    if (error) {
      console.error("stripe-webhook session expired release:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (event.type === "checkout.session.completed") {
    const tradeId = session.metadata?.trade_id;
    if (!tradeId) {
      return new Response(JSON.stringify({ received: true, skipped: "no trade_id in metadata" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pi = session.payment_intent;
    const paymentIntentId = typeof pi === "string" ? pi : pi?.id ?? null;
    let chargeId: string | null = null;
    if (paymentIntentId) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const latestCharge = paymentIntent.latest_charge;
        chargeId = typeof latestCharge === "string" ? latestCharge : latestCharge?.id ?? null;
      } catch (e) {
        console.error("stripe-webhook payment intent retrieve:", e);
      }
    }

    const { data: trade, error } = await admin
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
        seller_ship_by: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", tradeId)
      .in("status", ["reserved", "pending_payment"])
      .select("id, listing_id, buyer_id, seller_id, product_handle, size_label, currency, buyer_total_cents, seller_net_payout_cents, seller_ship_by")
      .maybeSingle();

    if (error) {
      console.error("stripe-webhook trade update:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (trade?.listing_id) {
      const { error: listingErr } = await admin
        .from("p2p_listings")
        .update({ status: "sold" })
        .eq("id", trade.listing_id)
        .eq("status", "reserved");

      if (listingErr) {
        console.error("stripe-webhook listing update:", listingErr);
        return new Response(JSON.stringify({ error: listingErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (trade) {
      await sendPaymentReceivedEmails(admin, trade);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
