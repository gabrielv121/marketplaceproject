import { getSupabase } from "@/lib/supabase";

let lastSearchKey = "";
let lastSearchAt = 0;

/** Fire-and-forget search logging. Never throws to callers. */
export function logSearchEvent(input: {
  query: string;
  resultCount: number;
  path?: string;
  clickedHandle?: string | null;
}): void {
  const query = input.query.trim();
  if (!query) return;

  const now = Date.now();
  const key = `${query.toLowerCase()}|${input.clickedHandle ?? ""}|${input.resultCount}`;
  if (!input.clickedHandle && key === lastSearchKey && now - lastSearchAt < 1000) return;
  lastSearchKey = key;
  lastSearchAt = now;

  const sb = getSupabase();
  if (!sb) return;

  void (async () => {
    try {
      const { data } = await sb.auth.getSession();
      const userId = data.session?.user?.id ?? null;
      await sb.from("search_events").insert({
        user_id: userId,
        query,
        result_count: Math.max(0, input.resultCount),
        clicked_handle: input.clickedHandle ?? null,
        path: input.path ?? (typeof window !== "undefined" ? window.location.pathname : null),
      });
    } catch {
      /* ignore analytics failures */
    }
  })();
}

/** Fire-and-forget product view logging. Never throws to callers. */
export function logProductView(input: { productHandle: string; path?: string }): void {
  const handle = input.productHandle.trim();
  if (!handle) return;

  const sb = getSupabase();
  if (!sb) return;

  void (async () => {
    try {
      const { data } = await sb.auth.getSession();
      const userId = data.session?.user?.id ?? null;
      await sb.from("product_views").insert({
        user_id: userId,
        product_handle: handle,
        path: input.path ?? (typeof window !== "undefined" ? window.location.pathname : null),
      });
    } catch {
      /* ignore analytics failures */
    }
  })();
}
