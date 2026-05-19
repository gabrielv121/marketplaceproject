import type { TradeDetailRow } from "@/lib/trade-detail";

/** Strip any counterparty fields that might leak via admin merge or legacy responses. */
export function redactTradeForParticipant(row: TradeDetailRow): TradeDetailRow {
  if (row.access === "admin") return row;

  const base: TradeDetailRow = {
    ...row,
    buyer_id: undefined,
    seller_id: undefined,
    buyer_email: null,
    seller_email: null,
    buyer_label_url: null,
    buyer_label_carrier: null,
    buyer_label_service: null,
  };

  if (row.role === "seller") {
    return {
      ...base,
      buyer_shipping_name: null,
      buyer_shipping_email: null,
      buyer_shipping_phone: null,
      buyer_shipping_line1: null,
      buyer_shipping_line2: null,
      buyer_shipping_city: null,
      buyer_shipping_state: null,
      buyer_shipping_postal_code: null,
      buyer_shipping_country: null,
      stripe_checkout_session_id: null,
    };
  }

  return {
    ...base,
    seller_label_url: null,
    seller_inbound_label_cents: null,
    seller_fee_cents: null,
    seller_net_payout_cents: null,
    stripe_transfer_id: null,
    stripe_transfer_amount_cents: null,
    stripe_transfer_error: null,
  };
}

export function parseParticipantTradeDetail(data: unknown): Omit<TradeDetailRow, "role"> & {
  role: TradeDetailRow["role"];
  access: TradeDetailRow["access"];
} {
  const row = data as Omit<TradeDetailRow, "role"> & {
    role?: TradeDetailRow["role"];
    access?: TradeDetailRow["access"];
  };
  return {
    ...row,
    role: row.role ?? "buyer",
    access: row.access ?? "participant",
  };
}
