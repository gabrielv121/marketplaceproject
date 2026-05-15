import { getSupabase } from "@/lib/supabase";

function parseInvokeError(error: unknown): string {
  if (error && typeof error === "object") {
    const o = error as { message?: string; context?: { body?: unknown } };
    const body = o.context?.body;
    if (body && typeof body === "object" && body !== null && "error" in body) {
      return String((body as { error: string }).error);
    }
    if (o.message) return o.message;
  }
  return "Checkout failed";
}

/**
 * Starts or resumes Stripe Checkout for a reserved P2P trade.
 * Buyer payment is collected by the platform and held until verification/delivery.
 */
export async function startCheckoutForTrade(tradeId: string, siteUrl: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const origin = siteUrl.replace(/\/$/, "");
  const { data, error } = await sb.functions.invoke<{ url?: string; error?: string }>("create-checkout-session", {
    body: { trade_id: tradeId, site_url: origin },
  });

  if (error) {
    throw new Error(parseInvokeError(error));
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }
  if (!data?.url) {
    throw new Error("No checkout URL returned. Deploy create-checkout-session and set Stripe secrets.");
  }
  return data.url;
}

/** Verifies a returned Stripe Checkout Session and updates the trade if the webhook was missed. */
export async function confirmCheckoutSession(sessionId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { data, error } = await sb.functions.invoke<{ ok?: boolean; error?: string }>("confirm-checkout-session", {
    body: { session_id: sessionId },
  });

  if (error) {
    throw new Error(parseInvokeError(error));
  }
  if (data?.error) {
    throw new Error(String(data.error));
  }
}

/** Starts or resumes Stripe Connect Express onboarding for the signed-in seller. */
export async function startSellerOnboarding(siteUrl: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const origin = siteUrl.replace(/\/$/, "");
  const { data, error } = await sb.functions.invoke<{ url?: string; error?: string }>("create-connect-account-link", {
    body: { site_url: origin },
  });

  if (error) {
    throw new Error(parseInvokeError(error));
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }
  if (!data?.url) {
    throw new Error("No onboarding URL returned. Deploy create-connect-account-link and set Stripe secrets.");
  }
  return data.url;
}
