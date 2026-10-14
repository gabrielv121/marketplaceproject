const PRODUCTION_ORIGIN = "https://vrna.io";

/** Keep local dev on localhost. Every public host, including the Vercel address, uses vrna.io. */
export function canonicalSiteOrigin(): string {
  if (typeof window === "undefined") return PRODUCTION_ORIGIN;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return window.location.origin;
  return PRODUCTION_ORIGIN;
}

/** Only allow in-app paths so an OAuth return cannot send someone off-site. */
export function safeNextPath(raw: string | null | undefined, fallback = "/account"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("://")) return fallback;
  return raw;
}

export function oauthCallbackUrl(nextPath: string): string {
  const next = safeNextPath(nextPath);
  const url = new URL("/auth/callback", canonicalSiteOrigin());
  url.searchParams.set("next", next);
  return url.toString();
}
