/** Marketplace brand — update here when renaming. */
export const BRAND_NAME = "VRNA";

/** Verification / inbound shipping hub (seller ships here). */
export const BRAND_HUB = BRAND_NAME;

export function brandPossessive(): string {
  return `${BRAND_NAME}'s`;
}
