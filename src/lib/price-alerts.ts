import { getSupabase } from "@/lib/supabase";

export type PriceAlertRow = {
  id: string;
  created_at: string;
  product_handle: string;
  size_label: string;
  target_cents: number;
  status: "active" | "triggered";
  triggered_at: string | null;
  triggered_price_cents: number | null;
};

const ALERT_COLUMNS = "id,created_at,product_handle,size_label,target_cents,status,triggered_at,triggered_price_cents";

export async function fetchMyPriceAlerts(productHandle?: string): Promise<PriceAlertRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  let q = sb.from("price_alerts").select(ALERT_COLUMNS).order("created_at", { ascending: false }).limit(200);
  if (productHandle) q = q.eq("product_handle", productHandle);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PriceAlertRow[];
}

export async function createPriceAlert(input: {
  productHandle: string;
  sizeLabel: string;
  targetCents: number;
}): Promise<PriceAlertRow> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError || !auth.user) throw new Error("Sign in to set price alerts");
  const { data, error } = await sb
    .from("price_alerts")
    .insert({
      user_id: auth.user.id,
      product_handle: input.productHandle,
      size_label: input.sizeLabel,
      target_cents: input.targetCents,
    })
    .select(ALERT_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("You already have an alert for this size.");
    if (error.message.includes("price_alert_limit")) throw new Error("You can have up to 100 active price alerts.");
    throw error;
  }
  return data as PriceAlertRow;
}

export async function deletePriceAlert(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("price_alerts").delete().eq("id", id);
  if (error) throw error;
}
