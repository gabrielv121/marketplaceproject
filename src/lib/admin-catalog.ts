import { getSupabase } from "@/lib/supabase";

export type AdminCatalogRow = {
  handle: string;
  title: string;
  brand: string | null;
  featured_image_url: string | null;
  image_gallery: string[] | null;
  published: boolean;
  has_photo: boolean;
  admin_hidden: boolean;
  admin_image_url: string | null;
  featured_at: string | null;
  price_min: number | string;
};

function adminError(error: { message: string }): Error {
  if (error.message.includes("not_admin")) return new Error("Admin access required.");
  if (error.message.includes("image_url_must_be_https")) return new Error("Photo URL must start with https://");
  if (error.message.includes("product_not_found")) return new Error("Product not found.");
  return new Error(error.message);
}

/** Blank query lists pinned, hidden, and photo-overridden products. */
export async function adminSearchCatalog(query: string): Promise<AdminCatalogRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("admin_search_catalog", { p_query: query, p_limit: 40 });
  if (error) throw adminError(error);
  return (data ?? []) as AdminCatalogRow[];
}

export async function adminUpdateCatalogProduct(input: {
  handle: string;
  hidden?: boolean;
  /** Empty string clears the override. */
  imageUrl?: string;
  featured?: boolean;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.rpc("admin_update_catalog_product", {
    p_handle: input.handle,
    p_hidden: input.hidden ?? null,
    p_image_url: input.imageUrl ?? null,
    p_featured: input.featured ?? null,
  });
  if (error) throw adminError(error);
}