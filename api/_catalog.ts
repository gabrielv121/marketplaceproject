declare const process: { env: Record<string, string | undefined> };

export const SITE_URL = "https://vrna.io";

function env(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^["']|["']$/g, "");
}

export function supabaseConfig(): { url: string; key: string } | null {
  const url = env("VITE_SUPABASE_URL") || env("SUPABASE_URL");
  const key = env("VITE_SUPABASE_ANON_KEY") || env("SUPABASE_ANON_KEY");
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

/** GET a PostgREST path with the anon key; RLS limits it to public rows. */
export async function restGet(path: string, init?: { count?: boolean }): Promise<Response> {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error("Supabase env missing");
  const headers: Record<string, string> = { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` };
  if (init?.count) headers.Prefer = "count=exact";
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res;
}

/** Calls a PostgREST RPC with the anon key. */
export async function rpcPost<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error("Supabase env missing");
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return (await res.json()) as T;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
