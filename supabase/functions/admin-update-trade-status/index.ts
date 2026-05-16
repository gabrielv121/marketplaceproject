import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendTradeStatusEmails } from "../_shared/order-emails.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  trade_id?: string;
  status?: string;
  verification_notes?: string | null;
  seller_tracking_number?: string | null;
  buyer_tracking_number?: string | null;
};

type TradeRow = {
  id: string;
  status: string;
  buyer_id: string;
  seller_id: string;
  product_handle: string;
  size_label: string;
  currency: string;
  price_cents: number;
  seller_net_payout_cents: number | null;
  seller_tracking_number: string | null;
  buyer_tracking_number: string | null;
  seller_label_url?: string | null;
  buyer_label_url?: string | null;
  seller_shipped_at?: string | null;
  received_by_exch_at?: string | null;
  verified_at?: string | null;
  shipped_to_buyer_at?: string | null;
  delivered_to_buyer_at?: string | null;
  payout_available_at?: string | null;
  verification_notes: string | null;
};

const ALLOWED_STATUSES = new Set([
  "seller_notified",
  "seller_shipped_to_exch",
  "received_by_exch",
  "verification_passed",
  "verification_failed",
  "shipped_to_buyer",
  "delivered_to_buyer",
  "payout_available",
  "payout_paid",
  "payout_failed",
  "completed",
  "refunded",
]);

const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  paid: new Set(["seller_notified", "refunded"]),
  seller_notified: new Set(["seller_shipped_to_exch", "refunded"]),
  seller_shipped_to_exch: new Set(["received_by_exch", "refunded"]),
  received_by_exch: new Set(["verification_passed", "verification_failed", "refunded"]),
  verification_passed: new Set(["shipped_to_buyer", "refunded"]),
  verification_failed: new Set(["refunded"]),
  shipped_to_buyer: new Set(["delivered_to_buyer", "refunded"]),
  delivered_to_buyer: new Set(["payout_available"]),
  payout_available: new Set(["payout_failed"]),
  payout_failed: new Set(["payout_available"]),
};

function transitionBlocker(current: TradeRow, nextStatus: string, body: Body): string | null {
  const buyerTracking = body.buyer_tracking_number?.trim() || current.buyer_tracking_number;
  const sellerTracking = body.seller_tracking_number?.trim() || current.seller_tracking_number;

  if (nextStatus === "seller_shipped_to_exch" && !sellerTracking && !current.seller_label_url) {
    return "Seller shipment requires a prepaid label or seller tracking number.";
  }
  if (nextStatus === "received_by_exch" && !current.seller_shipped_at && !sellerTracking) {
    return "EXCH. can only mark received after the seller shipment is recorded.";
  }
  if ((nextStatus === "verification_passed" || nextStatus === "verification_failed") && !current.received_by_exch_at) {
    return "Verification can only be completed after EXCH. receives the item.";
  }
  if (nextStatus === "shipped_to_buyer" && (!current.buyer_label_url || !buyerTracking)) {
    return "Buyer shipment requires an EXCH-to-buyer label and tracking number.";
  }
  if (nextStatus === "delivered_to_buyer" && !buyerTracking) {
    return "Buyer delivery requires buyer tracking number.";
  }
  if (nextStatus === "payout_available" && !current.delivered_to_buyer_at) {
    return "Payout can only become available after buyer delivery is confirmed.";
  }
  return null;
}

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
    const status = body.status?.trim();
    if (!tradeId) return json({ error: "trade_id required" }, 400);
    if (!status || !ALLOWED_STATUSES.has(status)) return json({ error: "invalid_trade_status" }, 400);

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

    const { data: current, error: currentErr } = await admin
      .from("p2p_trades")
      .select(
        "id, status, buyer_id, seller_id, product_handle, size_label, currency, price_cents, seller_net_payout_cents, seller_tracking_number, buyer_tracking_number, seller_label_url, buyer_label_url, seller_shipped_at, received_by_exch_at, verified_at, shipped_to_buyer_at, delivered_to_buyer_at, payout_available_at, verification_notes",
      )
      .eq("id", tradeId)
      .maybeSingle<TradeRow>();
    if (currentErr) return json({ error: currentErr.message }, 500);
    if (!current) return json({ error: "trade_not_found" }, 404);

    const allowedNext = ALLOWED_TRANSITIONS[current.status];
    if (!allowedNext?.has(status)) {
      return json({ error: `Invalid status transition: ${current.status} to ${status}` }, 400);
    }
    const blocker = transitionBlocker(current, status, body);
    if (blocker) return json({ error: blocker }, 400);

    const patch = {
      status,
      verification_notes: body.verification_notes?.trim() || undefined,
      seller_tracking_number: body.seller_tracking_number?.trim() || undefined,
      buyer_tracking_number: body.buyer_tracking_number?.trim() || undefined,
      seller_shipped_at: status === "seller_shipped_to_exch" ? new Date().toISOString() : undefined,
      received_by_exch_at: status === "received_by_exch" ? new Date().toISOString() : undefined,
      verified_at: status === "verification_passed" || status === "verification_failed" ? new Date().toISOString() : undefined,
      shipped_to_buyer_at: status === "shipped_to_buyer" ? new Date().toISOString() : undefined,
      delivered_to_buyer_at: status === "delivered_to_buyer" ? new Date().toISOString() : undefined,
      payout_available_at: status === "payout_available" ? new Date().toISOString() : undefined,
      payout_paid_at: status === "payout_paid" ? new Date().toISOString() : undefined,
      refunded_at: status === "refunded" ? new Date().toISOString() : undefined,
    };
    const updatePayload = Object.fromEntries(Object.entries(patch).filter(([, value]) => value != null));

    const { data: updated, error: updateErr } = await admin
      .from("p2p_trades")
      .update(updatePayload)
      .eq("id", tradeId)
      .eq("status", current.status)
      .select(
        "id, status, buyer_id, seller_id, product_handle, size_label, currency, price_cents, seller_net_payout_cents, seller_tracking_number, buyer_tracking_number, verification_notes",
      )
      .maybeSingle<TradeRow>();

    if (updateErr) return json({ error: updateErr.message }, 500);
    if (!updated) return json({ error: "trade_not_found" }, 404);

    await sendTradeStatusEmails(admin, status, updated);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
