import { getSupabase, getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase";

export type SellerShipAddress = {
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

export type SellerInboundLabelResult = {
  label_url: string;
  tracking_number: string | null;
  carrier: string | null;
  service: string | null;
  cost_cents: number | null;
  email_sent?: boolean;
  email_error?: string;
  existing?: boolean;
};

function readableLabelError(body: unknown, fallback = "Shipping label failed"): string {
  if (body && typeof body === "object") {
    const parsed = body as { error?: unknown; detail?: unknown };
    if (parsed.error) {
      return parsed.detail ? `${String(parsed.error)} ${JSON.stringify(parsed.detail)}` : String(parsed.error);
    }
  }
  if (typeof body === "string" && body.trim()) return body;
  return fallback;
}

export async function createSellerInboundLabel(
  tradeId: string,
  fromAddress: SellerShipAddress,
): Promise<SellerInboundLabelResult> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) throw new Error("Sign in required");

  const response = await fetch(`${getSupabaseUrl()}/functions/v1/create-seller-inbound-label`, {
    method: "POST",
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${sessionData.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trade_id: tradeId, from_address: fromAddress }),
  });

  const text = await response.text();
  let data: (SellerInboundLabelResult & { error?: string; detail?: unknown }) | null = null;
  try {
    data = text ? (JSON.parse(text) as SellerInboundLabelResult & { error?: string; detail?: unknown }) : null;
  } catch {
    if (!response.ok) throw new Error(text || `Shipping label failed with status ${response.status}`);
  }

  if (!response.ok) throw new Error(readableLabelError(data, `Shipping label failed with status ${response.status}`));
  if (data?.error) throw new Error(readableLabelError(data));
  if (!data?.label_url) throw new Error("No label URL returned. Deploy create-seller-inbound-label and set Shippo secrets.");
  return data;
}
