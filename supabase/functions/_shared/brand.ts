export const BRAND_NAME = "VRNA";

export function verificationHubEnv(suffix: string): string | undefined {
  const primary = Deno.env.get(`VRNA_SHIP_TO_${suffix}`)?.trim();
  if (primary) return primary;
  return Deno.env.get(`EXCH_SHIP_TO_${suffix}`)?.trim();
}

export function requiredVerificationHubEnv(suffix: string): string {
  const value = verificationHubEnv(suffix);
  if (!value) {
    throw new Error(`Missing VRNA_SHIP_TO_${suffix} (or legacy EXCH_SHIP_TO_${suffix})`);
  }
  return value;
}
