import { getSupabase } from "@/lib/supabase";

export async function fetchMyFavoriteHandles(): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("product_favorites")
    .select("product_handle")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => String(row.product_handle));
}

export async function isFavoriteProduct(productHandle: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError || !auth.user) return false;
  const { data, error } = await sb
    .from("product_favorites")
    .select("product_handle")
    .eq("user_id", auth.user.id)
    .eq("product_handle", productHandle)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function toggleFavoriteProduct(productHandle: string, favorite: boolean): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError || !auth.user) throw new Error("Sign in to save favorites");

  if (favorite) {
    const { error } = await sb.from("product_favorites").upsert(
      {
        user_id: auth.user.id,
        product_handle: productHandle,
      },
      { onConflict: "user_id,product_handle" },
    );
    if (error) throw error;
    return;
  }

  const { error } = await sb
    .from("product_favorites")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("product_handle", productHandle);
  if (error) throw error;
}
