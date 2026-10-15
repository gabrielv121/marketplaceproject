import { getSupabase } from "@/lib/supabase";

/** Recent views, saves, and open bids. Higher means more wanted right now. */
export async function fetchCatalogDemandScores(): Promise<Map<string, number>> {
  const sb = getSupabase();
  if (!sb) return new Map();
  const { data, error } = await sb.rpc("catalog_product_demand");
  if (error || !Array.isArray(data)) return new Map();
  const scores = new Map<string, number>();
  for (const row of data as { product_handle?: string; score?: number }[]) {
    const handle = String(row.product_handle ?? "").trim();
    const score = Number(row.score) || 0;
    if (handle && score > 0) scores.set(handle, score);
  }
  return scores;
}
