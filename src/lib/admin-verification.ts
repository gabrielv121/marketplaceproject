import { getSupabase, getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase";

export type AdminTradeStatus =
  | "reserved"
  | "pending_payment"
  | "paid"
  | "seller_notified"
  | "seller_shipped_to_exch"
  | "received_by_exch"
  | "verification_passed"
  | "verification_failed"
  | "shipped_to_buyer"
  | "delivered_to_buyer"
  | "payout_available"
  | "payout_paid"
  | "payout_failed"
  | "completed"
  | "cancelled"
  | "refunded";

export type AdminVerificationTrade = {
  id: string;
  created_at: string;
  buyer_id: string;
  seller_id: string;
  buyer_email: string | null;
  seller_email: string | null;
  product_handle: string;
  size_label: string;
  price_cents: number;
  currency: string;
  status: AdminTradeStatus;
  paid_at: string | null;
  seller_ship_by: string | null;
  seller_shipped_at: string | null;
  received_by_exch_at: string | null;
  verified_at: string | null;
  shipped_to_buyer_at: string | null;
  delivered_to_buyer_at: string | null;
  payout_available_at: string | null;
  payout_paid_at: string | null;
  refunded_at: string | null;
  seller_tracking_number: string | null;
  buyer_tracking_number: string | null;
  verification_notes: string | null;
  buyer_shipping_cents: number;
  seller_inbound_label_cents: number;
  seller_fee_cents: number;
  seller_net_payout_cents: number;
  buyer_total_cents: number;
  seller_label_url: string | null;
  seller_label_carrier: string | null;
  seller_label_service: string | null;
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
  buyer_label_carrier: string | null;
  buyer_label_service: string | null;
  stripe_transfer_id: string | null;
  stripe_transfer_amount_cents: number | null;
  stripe_transfer_error: string | null;
  listing_condition: string | null;
  listing_photo_urls: string[];
  listing_defects: string | null;
  listing_box_included: boolean | null;
  listing_sku: string | null;
  listing_seller_notes: string | null;
  listing_verification_requirements_accepted_at: string | null;
};

export type AdminTradeUpdate = {
  status: AdminTradeStatus;
  verificationNotes?: string;
  sellerTrackingNumber?: string;
  buyerTrackingNumber?: string;
};

function readableAdminError(error: { message?: string; details?: string; hint?: string }): Error {
  const raw = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  if (raw.includes("not_admin")) return new Error("Admin access required. Mark your profile as admin in Supabase first.");
  if (raw.includes("invalid_trade_status")) return new Error("That trade status is not allowed.");
  if (raw.includes("trade_not_found")) return new Error("Trade was not found or is not in an admin-editable state.");
  return new Error(error.message ?? "Admin action failed");
}

export async function fetchAdminVerificationTrades(): Promise<AdminVerificationTrade[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb.rpc("admin_list_verification_trades");
  if (error) throw readableAdminError(error);
  return (data ?? []) as AdminVerificationTrade[];
}

export async function updateAdminTradeStatus(tradeId: string, update: AdminTradeUpdate): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb.functions.invoke<{ error?: string; ok?: boolean }>("admin-update-trade-status", {
    body: {
      trade_id: tradeId,
      status: update.status,
      verification_notes: update.verificationNotes?.trim() || null,
      seller_tracking_number: update.sellerTrackingNumber?.trim() || null,
      buyer_tracking_number: update.buyerTrackingNumber?.trim() || null,
    },
  });
  if (error) throw new Error(parseInvokeError(error));
  if (data?.error) throw new Error(String(data.error));
}

function parseInvokeError(error: unknown): string {
  if (error && typeof error === "object") {
    const o = error as { message?: string; context?: { body?: unknown } };
    const body = o.context?.body;
    if (body && typeof body === "object" && body !== null && "error" in body) {
      return String((body as { error: string }).error);
    }
    if (o.message) return o.message;
  }
  return "Payout release failed";
}

function readableFunctionBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const parsed = body as { error?: unknown; detail?: unknown };
    if (parsed.error) {
      return parsed.detail ? `${String(parsed.error)} ${JSON.stringify(parsed.detail)}` : String(parsed.error);
    }
  }
  if (typeof body === "string" && body.trim()) return body;
  return fallback;
}

export async function releaseSellerPayout(tradeId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) throw new Error("Sign in required");

  const response = await fetch(`${getSupabaseUrl()}/functions/v1/release-seller-payout`, {
    method: "POST",
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${sessionData.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trade_id: tradeId }),
  });

  const text = await response.text();
  let data: { error?: string; detail?: unknown; transfer_id?: string } | null = null;
  try {
    data = text ? (JSON.parse(text) as { error?: string; detail?: unknown; transfer_id?: string }) : null;
  } catch {
    if (!response.ok) throw new Error(text || `Payout release failed with status ${response.status}`);
  }

  if (!response.ok) throw new Error(readableFunctionBody(data, `Payout release failed with status ${response.status}`));
  if (data?.error) throw new Error(String(data.error));
}

function testEmailFailureMessage(parsed: Record<string, unknown>): string {
  const transport = typeof parsed.transport === "string" ? parsed.transport : "mailersend_api";
  const detail = parsed.detail ?? parsed.mailersend;
  const rid = typeof parsed.mailersend_request_id === "string" ? parsed.mailersend_request_id.trim() : "";
  const ridSuffix = rid ? ` Request-Id: ${rid}.` : "";
  const mailerStatus =
    typeof parsed.mailersend_status === "number"
      ? parsed.mailersend_status
      : typeof parsed.status === "number"
        ? parsed.status
        : null;
  const prefix =
    transport === "smtp"
      ? "SMTP"
      : mailerStatus != null
        ? `MailerSend HTTP ${mailerStatus}`
        : "Email";

  if (typeof parsed.auth_hint === "string" && parsed.auth_hint.trim()) {
    return parsed.auth_hint.trim();
  }
  if (transport === "smtp") {
    const cfg = parsed.config_check;
    if (cfg && typeof cfg === "object" && cfg !== null) {
      const c = cfg as Record<string, unknown>;
      if (c.smtp_configured === false) {
        return "Set SMTP_USER, SMTP_PASSWORD, and NOTIFICATION_FROM_EMAIL in Supabase Edge secrets (MailerSend → Domains → SMTP → Generate new user).";
      }
    }
    if (typeof detail === "object" && detail !== null) {
      const msg = (detail as { message?: unknown }).message;
      if (msg === "No recipients defined") {
        const attemptedTo = typeof parsed.to === "string" ? parsed.to : "unknown";
        return `SMTP had no valid recipient (attempted: ${attemptedTo}). Enter your email in the test field or redeploy send-test-email after the latest fix.`;
      }
    }
  }
  const domainsCheck = parsed.domains_check;
  if (domainsCheck && typeof domainsCheck === "object" && domainsCheck !== null) {
    const dc = domainsCheck as { suggested_from?: unknown; from_domain_ok?: unknown };
    if (dc.from_domain_ok === false && typeof dc.suggested_from === "string" && dc.suggested_from.trim()) {
      return `From domain mismatch. Set NOTIFICATION_FROM_EMAIL to: ${dc.suggested_from.trim()}`;
    }
  }
  const cfg = parsed.config_check;
  if (cfg && typeof cfg === "object" && cfg !== null) {
    const c = cfg as Record<string, unknown>;
    if (c.mailersend_key_configured === false) {
      return `${prefix}: MAILERSEND_API_KEY is not set in Supabase Edge secrets (.env.local does not apply).${ridSuffix}`;
    }
    if (c.mailersend_key_prefix_ok === false) {
      return `${prefix}: MAILERSEND_API_KEY in Supabase does not look like a MailerSend token (should start with mlsn.).${ridSuffix}`;
    }
  }
  if (detail == null) {
    return `${prefix} rejected the request (no detail in Edge response).${ridSuffix} Redeploy send-test-email and check Supabase secrets.`;
  }
  if (typeof detail === "string") {
    const t = detail.trim();
    return t ? `${prefix}: ${t}.${ridSuffix}` : `${prefix} rejected the request.${ridSuffix}`;
  }
  if (typeof detail === "object" && detail !== null) {
    const o = detail as Record<string, unknown>;
    if (typeof o._note === "string" && o._note.trim()) {
      const h = typeof o.hint === "string" && o.hint.trim() ? ` ${o.hint.trim()}` : "";
      return `${prefix}: ${o._note.trim()}${h}${ridSuffix}`;
    }
    if (typeof o.message === "string" && o.message.trim()) return `${prefix}: ${o.message.trim()}${ridSuffix}`;
    if (Array.isArray(o.errors) && o.errors.length) return `${prefix}: ${JSON.stringify(o.errors)}${ridSuffix}`;
    return `${prefix}: ${JSON.stringify(detail)}${ridSuffix}`;
  }
  return `${prefix} rejected the request.${ridSuffix}`;
}

export type MailerSendConfigCheck = {
  mailersend_key_configured: boolean;
  mailersend_key_prefix_ok: boolean;
  mailersend_key_length: number;
  notification_from_set: boolean;
  notification_from_email: string | null;
};

export type AdminTestEmailResult = {
  ok: boolean;
  status: number;
  transport?: string;
  from?: string;
  to?: string;
  detail?: unknown;
  mailersendRequestId?: string | null;
  smtpMessageId?: string | null;
  configCheck?: Record<string, unknown>;
  authHint?: string;
  domainsCheck?: unknown;
  error?: string;
};

/** Invokes `send-test-email` (admin-only). Uses SMTP or MailerSend API per Edge secrets. */
export async function sendAdminTestEmail(optionalTo?: string): Promise<AdminTestEmailResult> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) throw new Error("Sign in required");

  const body = optionalTo?.trim() ? { to: optionalTo.trim() } : {};

  const response = await fetch(`${getSupabaseUrl()}/functions/v1/send-test-email`, {
    method: "POST",
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${sessionData.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(text || `Send test email failed with status ${response.status}`);
  }

  if (typeof parsed.error === "string") {
    throw new Error(parsed.error);
  }

  const result: AdminTestEmailResult = {
    ok: Boolean(parsed.ok),
    status:
      typeof parsed.mailersend_status === "number"
        ? parsed.mailersend_status
        : typeof parsed.status === "number"
          ? parsed.status
          : response.status,
    from: typeof parsed.from === "string" ? parsed.from : undefined,
    to: typeof parsed.to === "string" ? parsed.to : undefined,
    transport: typeof parsed.transport === "string" ? parsed.transport : undefined,
    detail: parsed.detail ?? parsed.mailersend,
    mailersendRequestId: typeof parsed.mailersend_request_id === "string" ? parsed.mailersend_request_id : null,
    smtpMessageId: typeof parsed.smtp_message_id === "string" ? parsed.smtp_message_id : null,
    configCheck:
      parsed.config_check && typeof parsed.config_check === "object"
        ? (parsed.config_check as Record<string, unknown>)
        : undefined,
    authHint: typeof parsed.auth_hint === "string" ? parsed.auth_hint : undefined,
    domainsCheck:
      parsed.domains_check && typeof parsed.domains_check === "object"
        ? parsed.domains_check
        : undefined,
  };

  if (!response.ok || !result.ok) {
    result.error = testEmailFailureMessage(parsed);
  }

  return result;
}

export async function createBuyerOutboundLabel(tradeId: string): Promise<{ label_url?: string }> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) throw new Error("Sign in required");

  const response = await fetch(`${getSupabaseUrl()}/functions/v1/create-buyer-outbound-label`, {
    method: "POST",
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${sessionData.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trade_id: tradeId }),
  });

  const text = await response.text();
  let data: { error?: string; detail?: unknown; label_url?: string } | null = null;
  try {
    data = text ? (JSON.parse(text) as { error?: string; detail?: unknown; label_url?: string }) : null;
  } catch {
    if (!response.ok) throw new Error(text || `Buyer label failed with status ${response.status}`);
  }

  if (!response.ok) throw new Error(readableFunctionBody(data, `Buyer label failed with status ${response.status}`));
  if (data?.error) throw new Error(String(data.error));
  return data ?? {};
}
