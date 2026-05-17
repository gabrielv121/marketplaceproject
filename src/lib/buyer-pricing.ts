/** Buyer-side totals stored on p2p_trades after Checkout is created. */
export function buyerTradeTotalCents(row: {
  price_cents: number;
  buyer_shipping_cents?: number | null;
  buyer_processing_fee_cents?: number | null;
  buyer_total_cents?: number | null;
}): number {
  if (row.buyer_total_cents != null && row.buyer_total_cents > 0) return row.buyer_total_cents;
  return (
    row.price_cents +
    (row.buyer_shipping_cents ?? 0) +
    (row.buyer_processing_fee_cents ?? 0)
  );
}
