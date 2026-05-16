import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveSiteUrl, sendBidMatchEmails, type BidMatchTrade } from "../_shared/p2p-notification-email.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = { trade_id?: string; site_url?: string };

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
    const { data: trade, error: tradeErr } = await admin
      .from("p2p_trades")
      .select(
        "id, buyer_id, seller_id, product_handle, size_label, price_cents, currency, buyer_total_cents, status, bid_id, bid_match_notified_at",
      )
      .eq("id", tradeId)
      .maybeSingle<
        BidMatchTrade & {
          status: string;
          bid_id: string | null;
          bid_match_notified_at: string | null;
        }
      >();

    if (tradeErr) return json({ error: tradeErr.message }, 500);
    if (!trade) return json({ error: "Trade not found" }, 404);
    if (!trade.bid_id) return json({ error: "Trade is not a bid match" }, 400);
    if (trade.buyer_id !== user.id && trade.seller_id !== user.id) {
      return json({ error: "Forbidden" }, 403);
    }
    if (!["reserved", "pending_payment"].includes(trade.status)) {
      return json({ error: `Trade status is ${trade.status}` }, 400);
    }
    if (trade.bid_match_notified_at) {
      return json({ ok: true, already_sent: true });
    }

    const siteUrl = resolveSiteUrl(body.site_url);
    await sendBidMatchEmails(admin, trade, siteUrl);

    const { error: markErr } = await admin
      .from("p2p_trades")
      .update({ bid_match_notified_at: new Date().toISOString() })
      .eq("id", tradeId)
      .is("bid_match_notified_at", null);

    if (markErr) return json({ error: markErr.message }, 500);

    return json({ ok: true, trade_id: tradeId });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
