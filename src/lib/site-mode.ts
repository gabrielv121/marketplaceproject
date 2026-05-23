export type SiteMode = "marketplace" | "waitlist";

/** When `waitlist`, only /waitlist (and /join) are shown; use for pre-launch TikTok traffic. */
export function getSiteMode(): SiteMode {
  const raw = import.meta.env.VITE_SITE_MODE?.trim().toLowerCase();
  return raw === "waitlist" ? "waitlist" : "marketplace";
}

export function isWaitlistOnlySite(): boolean {
  return getSiteMode() === "waitlist";
}
