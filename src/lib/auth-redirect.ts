/** Only allow in-app paths so an OAuth return cannot send someone off-site. */
export function safeNextPath(raw: string | null | undefined, fallback = "/account"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("://")) return fallback;
  return raw;
}

export function oauthCallbackUrl(nextPath: string): string {
  const next = safeNextPath(nextPath);
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", next);
  return url.toString();
}
