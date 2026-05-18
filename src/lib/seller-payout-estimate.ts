import { moneyFromCents } from "@/lib/p2p";
import type { Money } from "@/types/marketplace";

/** Match Supabase Edge defaults in create-checkout-session / .env.example. */
const DEFAULT_SELLER_FEE_BPS = 900;
const DEFAULT_SELLER_INBOUND_LABEL_CENTS = 995;

function envInt(name: string, fallback: number): number {
  const raw = import.meta.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

export function sellerFeeBpsForDisplay(): number {
  return Math.min(10000, envInt("VITE_SELLER_FEE_BPS", DEFAULT_SELLER_FEE_BPS));
}

export function sellerInboundLabelCentsForDisplay(): number {
  return envInt("VITE_SELLER_INBOUND_LABEL_CENTS", DEFAULT_SELLER_INBOUND_LABEL_CENTS);
}

export type SellerPayoutEstimate = {
  askCents: number;
  feeCents: number;
  feeBps: number;
  inboundLabelCents: number;
  netCents: number;
  ask: Money;
  fee: Money;
  inboundLabel: Money;
  net: Money;
};

export function estimateSellerPayout(askCents: number, currency = "USD"): SellerPayoutEstimate | null {
  if (!Number.isFinite(askCents) || askCents <= 0) return null;

  const feeBps = sellerFeeBpsForDisplay();
  const inboundLabelCents = sellerInboundLabelCentsForDisplay();
  const feeCents = Math.floor((askCents * feeBps) / 10000);
  const netCents = Math.max(askCents - feeCents - inboundLabelCents, 0);

  return {
    askCents,
    feeCents,
    feeBps,
    inboundLabelCents,
    netCents,
    ask: moneyFromCents(askCents, currency),
    fee: moneyFromCents(feeCents, currency),
    inboundLabel: moneyFromCents(inboundLabelCents, currency),
    net: moneyFromCents(netCents, currency),
  };
}

export function sellerFeePercentLabel(feeBps: number): string {
  const pct = feeBps / 100;
  return pct % 1 === 0 ? `${pct.toFixed(0)}%` : `${pct.toFixed(2)}%`;
}
