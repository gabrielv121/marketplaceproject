import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = { trade_id?: string };

type TradeRow = {
  id: string;
  seller_id: string;
  product_handle: string;
  size_label: string;
  currency: string;
  status: string;
  seller_net_payout_cents: number | null;
  stripe_charge_id: string | null;
  stripe_transfer_id: string | null;
};

type ProfileRow = {
  stripe_account_id: string | null;
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
    const tradeId = body.trade_id?.trim();
    if (!tradeId) return json({ error: "trade_id required" }, 400);

    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceRole);
    const { data: adminProfile, error: adminErr } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle<{ is_admin: boolean }>();

    if (adminErr) return json({ error: adminErr.message }, 500);
    if (!adminProfile?.is_admin) return json({ error: "Admin access required" }, 403);

    const { data: trade, error: tradeErr } = await admin
      .from("p2p_trades")
      .select("id, seller_id, product_handle, size_label, currency, status, seller_net_payout_cents, stripe_charge_id, stripe_transfer_id")
      .eq("id", tradeId)
      .maybeSingle<TradeRow>();

    if (tradeErr) return json({ error: tradeErr.message }, 500);
    if (!trade) return json({ error: "Trade not found" }, 404);
    if (trade.status !== "payout_available") return json({ error: "Trade is not payout_available" }, 400);
    if (trade.stripe_transfer_id) return json({ transfer_id: trade.stripe_transfer_id, existing: true });

    const amount = Math.trunc(trade.seller_net_payout_cents ?? 0);
    if (amount <= 0) return json({ error: "Seller net payout must be greater than 0" }, 400);

    const { data: sellerProfile, error: profileErr } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", trade.seller_id)
      .maybeSingle<ProfileRow>();

    if (profileErr) return json({ error: profileErr.message }, 500);
    const destination = sellerProfile?.stripe_account_id?.trim();
    if (!destination) return json({ error: "Seller has not connected Stripe payout account" }, 400);

    const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
    const transferParams: Stripe.TransferCreateParams = {
      amount,
      currency: String(trade.currency ?? "USD").toLowerCase(),
      destination,
      transfer_group: `trade_${trade.id}`,
      metadata: {
        trade_id: trade.id,
        seller_id: trade.seller_id,
        product_handle: trade.product_handle,
        size_label: trade.size_label,
      },
    };
    if (trade.stripe_charge_id) {
      transferParams.source_transaction = trade.stripe_charge_id;
    }

    try {
      const transfer = await stripe.transfers.create(transferParams, {
        idempotencyKey: `trade_${trade.id}_seller_payout`,
      });

      const { error: updateErr } = await admin
        .from("p2p_trades")
        .update({
          status: "payout_paid",
          stripe_transfer_id: transfer.id,
          stripe_transfer_amount_cents: amount,
          stripe_transfer_error: null,
          payout_paid_at: new Date().toISOString(),
        })
        .eq("id", trade.id)
        .eq("status", "payout_available")
        .is("stripe_transfer_id", null);

      if (updateErr) return json({ error: updateErr.message }, 500);

      return json({
        transfer_id: transfer.id,
        amount_cents: amount,
        destination,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await admin
        .from("p2p_trades")
        .update({
          status: "payout_failed",
          stripe_transfer_error: message,
        })
        .eq("id", trade.id)
        .eq("status", "payout_available");
      return json({ error: message }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
