import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { tryNotificationEmail } from "../_shared/send-notification-email.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

type Body = {
  trade_id?: string;
  from_address?: Partial<ShipAddress>;
};

type TradeRow = {
  id: string;
  seller_id: string;
  product_handle: string;
  size_label: string;
  price_cents: number;
  status: string;
  seller_fee_cents: number | null;
  seller_label_url: string | null;
};

type ShippoRate = {
  object_id: string;
  amount: string;
  currency: string;
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

type LabelEmailResult = {
  sent: boolean;
  error?: string;
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

function cleanAddress(input: Partial<ShipAddress> | undefined, fallbackEmail?: string): ShipAddress {
  const address = {
    name: input?.name?.trim(),
    street1: input?.street1?.trim(),
    street2: input?.street2?.trim() || undefined,
    city: input?.city?.trim(),
    state: input?.state?.trim(),
    zip: input?.zip?.trim(),
    country: input?.country?.trim() || "US",
    phone: input?.phone?.trim() || Deno.env.get("SELLER_DEFAULT_PHONE")?.trim() || undefined,
    email: input?.email?.trim() || fallbackEmail,
  };

  const missing = (["name", "street1", "city", "state", "zip", "country"] as const).filter((key) => !address[key]);
  if (missing.length) throw new Error(`Missing seller address: ${missing.join(", ")}`);
  return address as ShipAddress;
}

function cents(amount: string | number | undefined): number {
  const parsed = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
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

async function sendLabelEmail(params: {
  to?: string | null;
  product: string;
  labelUrl: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  service?: string | null;
}): Promise<LabelEmailResult> {
  const tracking = params.trackingNumber ? `<p><strong>Tracking:</strong> ${params.trackingNumber}</p>` : "";
  const carrier = [params.carrier, params.service].filter(Boolean).join(" ");
  const carrierText = carrier ? `<p><strong>Carrier:</strong> ${carrier}</p>` : "";
  return tryNotificationEmail({
    to: params.to,
    subject: `Your EXCH. shipping label for ${params.product}`,
    html: `<p>Your prepaid label for <strong>${params.product}</strong> is ready.</p>${tracking}${carrierText}<p><a href="${params.labelUrl}">Download your shipping label</a></p><p>Please print it, attach it to the package, and ship the item to EXCH. for verification.</p>`,
    text: `Your prepaid label for ${params.product} is ready.\n${params.trackingNumber ? `Tracking: ${params.trackingNumber}\n` : ""}${carrier ? `Carrier: ${carrier}\n` : ""}Download your shipping label: ${params.labelUrl}\nPlease print it, attach it to the package, and ship the item to EXCH. for verification.`,
  });
}

function candidateRates(rates: ShippoRate[]): ShippoRate[] {
  const preferred = Deno.env.get("SHIPPO_SERVICELEVEL_TOKEN")?.trim();
  const usable = rates.filter((rate) => rate.object_id && Number.isFinite(Number(rate.amount)));
  if (!usable.length) throw new Error("Shippo returned no purchasable rates for this address.");

  return usable.sort((a, b) => {
    const aToken = a.servicelevel?.token ?? "";
    const bToken = b.servicelevel?.token ?? "";
    const aProvider = (a.provider ?? "").toLowerCase();
    const bProvider = (b.provider ?? "").toLowerCase();
    const aPreferred = preferred && aToken === preferred ? 0 : 1;
    const bPreferred = preferred && bToken === preferred ? 0 : 1;
    if (aPreferred !== bPreferred) return aPreferred - bPreferred;

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

  throw new Error(`Shippo did not return a successful label. ${JSON.stringify(failures)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const shippoToken = requiredEnv("SHIPPO_API_TOKEN");
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
    const { data: trade, error: tradeErr } = await admin
      .from("p2p_trades")
      .select("id, seller_id, product_handle, size_label, price_cents, status, seller_fee_cents, seller_label_url")
      .eq("id", tradeId)
      .maybeSingle<TradeRow>();

    if (tradeErr) return json({ error: tradeErr.message }, 500);
    if (!trade) return json({ error: "Trade not found" }, 404);
    if (trade.seller_id !== user.id) return json({ error: "Forbidden" }, 403);
    if (!["paid", "seller_notified"].includes(trade.status)) {
      return json({ error: "Label can only be created after buyer payment and before seller shipment." }, 400);
    }
    if (trade.seller_label_url) return json({ label_url: trade.seller_label_url, existing: true });

    const fromAddress = cleanAddress(body.from_address, user.email ?? undefined);
    const metadata = labelMetadata("EXCH inbound", trade);
    const shipment = await shippoPost<{ object_id: string; rates?: ShippoRate[] }>("/shipments/", shippoToken, {
      address_from: fromAddress,
      address_to: exchAddress,
      parcels: [parcel()],
      async: false,
      metadata,
    });
    const { rate, transaction } = await buyFirstAvailableLabel(shipment.rates ?? [], shippoToken, metadata);

    const labelCostCents = cents(rate.amount);
    const sellerFeeCents = trade.seller_fee_cents ?? 0;
    const sellerNetPayoutCents = Math.max(trade.price_cents - sellerFeeCents - labelCostCents, 0);
    const { error: updateErr } = await admin
      .from("p2p_trades")
      .update({
        seller_label_provider: "shippo",
        seller_label_id: transaction.object_id,
        seller_label_url: transaction.label_url,
        seller_label_rate_id: rate.object_id,
        seller_label_carrier: rate.provider ?? null,
        seller_label_service: rate.servicelevel?.name ?? rate.servicelevel?.token ?? null,
        seller_label_created_at: new Date().toISOString(),
        seller_tracking_number: transaction.tracking_number ?? null,
        seller_inbound_label_cents: labelCostCents,
        seller_net_payout_cents: sellerNetPayoutCents,
      })
      .eq("id", trade.id)
      .eq("seller_id", user.id)
      .in("status", ["paid", "seller_notified"]);

    if (updateErr) return json({ error: updateErr.message }, 500);

    const labelEmail = await sendLabelEmail({
      to: user.email,
      product: `${trade.product_handle} (${trade.size_label})`,
      labelUrl: transaction.label_url,
      trackingNumber: transaction.tracking_number ?? null,
      carrier: rate.provider ?? null,
      service: rate.servicelevel?.name ?? rate.servicelevel?.token ?? null,
    });

    return json({
      label_url: transaction.label_url,
      tracking_number: transaction.tracking_number ?? null,
      carrier: rate.provider ?? null,
      service: rate.servicelevel?.name ?? rate.servicelevel?.token ?? null,
      cost_cents: labelCostCents,
      email_sent: labelEmail.sent,
      email_error: labelEmail.error,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
