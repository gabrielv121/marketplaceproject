import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function sanitizeEnv(v: unknown): string {
  if (v == null) return "";
  let s = String(v).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export function getSupabaseUrl(): string {
  return sanitizeEnv(import.meta.env.VITE_SUPABASE_URL);
}

export function getSupabaseAnonKey(): string {
  return sanitizeEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;
let clientCredentials = "";

export function isP2pConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

export function getSupabase(): SupabaseClient | null {
  if (!isP2pConfigured()) return null;
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  const pair = `${url}|${key}`;
  if (!client || clientCredentials !== pair) {
    client = createClient(url, key);
    clientCredentials = pair;
  }
  return client;
}
