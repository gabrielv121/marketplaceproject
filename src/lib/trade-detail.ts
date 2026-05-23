import { fetchAdminVerificationTrades, type AdminVerificationTrade } from "@/lib/admin-verification";
import type { MyTradeRow } from "@/lib/account-data";
import { getSupabase } from "@/lib/supabase";
import { parseParticipantTradeDetail, redactTradeForParticipant } from "@/lib/trade-privacy";

export type TradeDetailRole = "buyer" | "seller" | "admin";
export type TradeDetailAccess = "participant" | "admin";

export type TradeDetailRow = Omit<MyTradeRow, "role"> & {
  role: TradeDetailRole;
  access: TradeDetailAccess;
  /** Admin dashboard only — never shown to the other participant. */
  buyer_id?: string;
  seller_id?: string;
  buyer_email?: string | null;
  seller_email?: string | null;
  seller_ship_by?: string | null;
  buyer_tracking_number?: string | null;
  verification_notes?: string | null;
  buyer_shipping_name?: string | null;
  buyer_shipping_email?: string | null;
  buyer_shipping_phone?: string | null;
  buyer_shipping_line1?: string | null;
  buyer_shipping_line2?: string | null;
  buyer_shipping_city?: string | null;
  buyer_shipping_state?: string | null;
  buyer_shipping_postal_code?: string | null;
  buyer_shipping_country?: string | null;
  buyer_label_url?: string | null;
  buyer_label_carrier?: string | null;
  buyer_label_service?: string | null;
  stripe_transfer_id?: string | null;
  stripe_transfer_amount_cents?: number | null;
  stripe_transfer_error?: string | null;
};

function roleForUser(row: { buyer_id: string; seller_id: string }, userId: string): TradeDetailRole {
  if (row.buyer_id === userId) return "buyer";
  if (row.seller_id === userId) return "seller";
  return "admin";
}

/** Outbound VRNA→buyer labels are admin-only; never expose the printable URL to participants. */
function redactParticipantTrade(row: TradeDetailRow): TradeDetailRow {
  return redactTradeForParticipant({
    ...row,
    buyer_label_url: row.access === "admin" ? row.buyer_label_url : null,
    buyer_label_carrier: row.access === "admin" ? row.buyer_label_carrier : null,
    buyer_label_service: row.access === "admin" ? row.buyer_label_service : null,
  });
}

function fromAdminRow(row: AdminVerificationTrade, userId: string): TradeDetailRow {
  return {
    ...row,
    stripe_checkout_session_id: null,
    role: roleForUser(row, userId),
    access: "admin",
  };
}

export async function fetchTradeDetail(tradeId: string): Promise<TradeDetailRow> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError || !auth.user) throw new Error("Sign in required");

  const { data, error } = await sb.rpc("get_trade_for_participant", { p_trade_id: tradeId });
  if (error) throw error;

  if (data) {
    const parsed = parseParticipantTradeDetail(data);
    return redactParticipantTrade({
      ...parsed,
      role: parsed.role,
      access: "participant",
    });
  }

  try {
    const adminRows = await fetchAdminVerificationTrades();
    const adminRow = adminRows.find((row) => row.id === tradeId);
    if (adminRow) return redactParticipantTrade(fromAdminRow(adminRow, auth.user.id));
  } catch {
    // Non-admin users should see the generic not-found/access message below.
  }

  throw new Error("Trade not found or you do not have access.");
}
