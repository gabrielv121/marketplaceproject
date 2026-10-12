export function isPlatformOrder(row: { fulfillment_source?: string | null }): boolean {
  return row.fulfillment_source === "platform";
}

/** Buyer-facing label. VRNA inventory is already authenticated, so it waits on shipment. */
export function buyerFacingStatus(status: string, fulfillmentSource?: string | null): string {
  if (fulfillmentSource === "platform" && status === "verification_passed") return "Preparing shipment";
  return status.replaceAll("_", " ");
}
