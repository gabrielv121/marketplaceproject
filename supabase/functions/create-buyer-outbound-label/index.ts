import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendBuyerShippedEmail } from "../_shared/order-emails.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = { trade_id?: string };

type ShipAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
};

type TradeRow = {
  id: string;
  buyer_id: string;
  product_handle: string;
  size_label: string;
  status: string;
  buyer_shipping_name: string | null;
  buyer_shipping_email: string | null;
  buyer_shipping_phone: string | null;
  buyer_shipping_line1: string | null;
  buyer_shipping_line2: string | null;
  buyer_shipping_city: string | null;
  buyer_shipping_state: string | null;
  buyer_shipping_postal_code: string | null;
  buyer_shipping_country: string | null;
  buyer_label_url: string | null;
  stripe_checkout_session_id: string | null;
};

type ShippoRate = {
  object_id: string;
  amount: string;
  provider?: string;
  servicelevel?: { name?: string; token?: string };
};

type ShippoTransaction = {
  object_id: string;
  status: string;
  label_url?: string;
  tracking_number?: string;
  messages?: unknown[];
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

function envAddress(): ShipAddress {
  return {
    name: requiredEnv("EXCH_SHIP_TO_NAME"),
    street1: requiredEnv("EXCH_SHIP_TO_STREET1"),
    street2: Deno.env.get("EXCH_SHIP_TO_STREET2")?.trim() || undefined,
    city: requiredEnv("EXCH_SHIP_TO_CITY"),
    state: requiredEnv("EXCH_SHIP_TO_STATE"),
    zip: requiredEnv("EXCH_SHIP_TO_ZIP"),
    country: Deno.env.get("EXCH_SHIP_TO_COUNTRY")?.trim() || "US",
    phone: Deno.env.get("EXCH_SHIP_TO_PHONE")?.trim() || undefined,
    email: Deno.env.get("EXCH_SHIP_TO_EMAIL")?.trim() || undefined,
  };
}

function buyerAddress(trade: TradeRow, fallbackEmail?: string | null): ShipAddress {
  const address = {
    name: trade.buyer_shipping_name?.trim(),
    street1: trade.buyer_shipping_line1?.trim(),
    street2: trade.buyer_shipping_line2?.trim() || undefined,
    city: trade.buyer_shipping_city?.trim(),
    state: trade.buyer_shipping_state?.trim(),
    zip: trade.buyer_shipping_postal_code?.trim(),
    country: trade.buyer_shipping_country?.trim() || "US",
    phone: trade.buyer_shipping_phone?.trim() || undefined,
    email: trade.buyer_shipping_email?.trim() || fallbackEmail || undefined,
  };
  const missing = (["name", "street1", "city", "state", "zip", "country"] as const).filter((key) => !address[key]);
  if (missing.length) throw new Error(`Missing buyer shipping address: ${missing.join(", ")}`);
  return address as ShipAddress;
}

function hasBuyerAddress(trade: TradeRow): boolean {
  return Boolean(
    trade.buyer_shipping_name &&
      trade.buyer_shipping_line1 &&
      trade.buyer_shipping_city &&
      trade.buyer_shipping_state &&
      trade.buyer_shipping_postal_code &&
      trade.buyer_shipping_country,
  );
}

function buyerShippingPatch(session: Stripe.Checkout.Session): Partial<TradeRow> {
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

function labelMetadata(prefix: string, trade: Pick<TradeRow, "id" | "size_label">): string {
  return `${prefix} ${trade.id} ${trade.size_label}`.slice(0, 100);
}

function parcel() {
  return {
    length: Deno.env.get("SHIPPO_PARCEL_LENGTH")?.trim() || "14",
    width: Deno.env.get("SHIPPO_PARCEL_WIDTH")?.trim() || "10",
    height: Deno.env.get("SHIPPO_PARCEL_HEIGHT")?.trim() || "6",
    distance_unit: Deno.env.get("SHIPPO_PARCEL_DISTANCE_UNIT")?.trim() || "in",
    weight: Deno.env.get("SHIPPO_PARCEL_WEIGHT")?.trim() || "4",
    mass_unit: Deno.env.get("SHIPPO_PARCEL_MASS_UNIT")?.trim() || "lb",
  };
}

async function shippoPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.goshippo.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `ShippoToken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data === "object" && data !== null ? JSON.stringify(data) : String(data);
    throw new Error(`Shippo ${path} failed: ${detail}`);
  }
  return data as T;
}

function candidateRates(rates: ShippoRate[]): ShippoRate[] {
  const preferred = Deno.env.get("SHIPPO_SERVICELEVEL_TOKEN")?.trim();
  const usable = rates.filter((rate) => rate.object_id && Number.isFinite(Number(rate.amount)));
  if (!usable.length) throw new Error("Shippo returned no purchasable rates for this address.");

  return usable.sort((a, b) => {
    const aPreferred = preferred && a.servicelevel?.token === preferred ? 0 : 1;
    const bPreferred = preferred && b.servicelevel?.token === preferred ? 0 : 1;
    if (aPreferred !== bPreferred) return aPreferred - bPreferred;

    const aProvider = (a.provider ?? "").toLowerCase();
    const bProvider = (b.provider ?? "").toLowerCase();
    const aUsps = aProvider.includes("usps") ? 0 : 1;
    const bUsps = bProvider.includes("usps") ? 0 : 1;
    if (aUsps !== bUsps) return aUsps - bUsps;

    const aUps = aProvider.includes("ups") ? 1 : 0;
    const bUps = bProvider.includes("ups") ? 1 : 0;
    if (aUps !== bUps) return aUps - bUps;

    return Number(a.amount) - Number(b.amount);
  });
}

async function buyFirstAvailableLabel(
  rates: ShippoRate[],
  shippoToken: string,
  metadata: string,
): Promise<{ rate: ShippoRate; transaction: ShippoTransaction }> {
  const failures: unknown[] = [];

  for (const rate of candidateRates(rates)) {
    const transaction = await shippoPost<ShippoTransaction>("/transactions/", shippoToken, {
      rate: rate.object_id,
      async: false,
      label_file_type: Deno.env.get("SHIPPO_LABEL_FILE_TYPE")?.trim() || "PDF_4x6",
      metadata,
    });

    if (transaction.status === "SUCCESS" && transaction.label_url) {
      return { rate, transaction };
    }
    failures.push({
      provider: rate.provider,
      service: rate.servicelevel?.name ?? rate.servicelevel?.token,
      messages: transaction.messages ?? [],
    });
  }

  throw new Error(`Shippo did not return a successful buyer label. ${JSON.stringify(failures)}`);
}

async function userEmail(admin: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) return null;
  return data.user?.email ?? null;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const shippoToken = requiredEnv("SHIPPO_API_TOKEN");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const supabaseAnon = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const exchAddress = envAddress();

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
      .select(
        "id, buyer_id, product_handle, size_label, status, buyer_shipping_name, buyer_shipping_email, buyer_shipping_phone, buyer_shipping_line1, buyer_shipping_line2, buyer_shipping_city, buyer_shipping_state, buyer_shipping_postal_code, buyer_shipping_country, buyer_label_url, stripe_checkout_session_id",
      )
      .eq("id", tradeId)
      .maybeSingle<TradeRow>();

    if (tradeErr) return json({ error: tradeErr.message }, 500);
    if (!trade) return json({ error: "Trade not found" }, 404);
    if (trade.buyer_label_url) return json({ label_url: trade.buyer_label_url, existing: true });
    if (trade.status !== "verification_passed") {
      return json({ error: "Buyer label can only be created after verification passes." }, 400);
    }

    const buyerEmail = await userEmail(admin, trade.buyer_id);
    let tradeWithAddress = trade;
    if (!hasBuyerAddress(trade) && trade.stripe_checkout_session_id && stripeKey) {
      const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
      const session = await stripe.checkout.sessions.retrieve(trade.stripe_checkout_session_id);
      const patch = buyerShippingPatch(session);
      await admin.from("p2p_trades").update(patch).eq("id", trade.id);
      tradeWithAddress = { ...trade, ...patch };
    }

    const toAddress = buyerAddress(tradeWithAddress, buyerEmail);
    const metadata = labelMetadata("EXCH outbound", trade);
    const shipment = await shippoPost<{ object_id: string; rates?: ShippoRate[] }>("/shipments/", shippoToken, {
      address_from: exchAddress,
      address_to: toAddress,
      parcels: [parcel()],
      async: false,
      metadata,
    });
    const { rate, transaction } = await buyFirstAvailableLabel(shipment.rates ?? [], shippoToken, metadata);

    const { error: updateErr } = await admin
      .from("p2p_trades")
      .update({
        status: "shipped_to_buyer",
        shipped_to_buyer_at: new Date().toISOString(),
        buyer_label_provider: "shippo",
        buyer_label_id: transaction.object_id,
        buyer_label_url: transaction.label_url,
        buyer_label_rate_id: rate.object_id,
        buyer_label_carrier: rate.provider ?? null,
        buyer_label_service: rate.servicelevel?.name ?? rate.servicelevel?.token ?? null,
        buyer_label_created_at: new Date().toISOString(),
        buyer_tracking_number: transaction.tracking_number ?? null,
      })
      .eq("id", trade.id)
      .eq("status", "verification_passed");
    if (updateErr) return json({ error: updateErr.message }, 500);

    await sendBuyerShippedEmail({
      admin,
      to: buyerEmail,
      productHandle: trade.product_handle,
      sizeLabel: trade.size_label,
      tradeId: trade.id,
      trackingNumber: transaction.tracking_number ?? null,
      carrier: rate.provider ?? null,
      service: rate.servicelevel?.name ?? rate.servicelevel?.token ?? null,
    });

    return json({
      label_url: transaction.label_url,
      tracking_number: transaction.tracking_number ?? null,
      carrier: rate.provider ?? null,
      service: rate.servicelevel?.name ?? rate.servicelevel?.token ?? null,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
