import { getSupabase } from "@/lib/supabase";

export type PriceHistoryRow = {
  size_label: string;
  recorded_on: string;
  lowest_ask_cents: number | null;
};

export async function fetchPriceHistory(productHandle: string): Promise<PriceHistoryRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("price_history")
    .select("size_label,recorded_on,lowest_ask_cents")
    .eq("product_handle", productHandle)
    .order("recorded_on", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as PriceHistoryRow[];
}

export type PricePoint = { day: string; cents: number | null };

/**
 * Turns change-only rows into one step series. With several sizes the value on a day
 * is the cheapest size that still has an ask.
 */
export function priceSeries(rows: PriceHistoryRow[]): PricePoint[] {
  const current = new Map<string, number | null>();
  const points: PricePoint[] = [];
  const sorted = [...rows].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on));
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    current.set(row.size_label, row.lowest_ask_cents);
    if (sorted[i + 1]?.recorded_on === row.recorded_on) continue;
    let low: number | null = null;
    for (const cents of current.values()) {
      if (cents != null && (low == null || cents < low)) low = cents;
    }
    if (points.length && points[points.length - 1].cents === low) continue;
    points.push({ day: row.recorded_on, cents: low });
  }
  return points;
}
