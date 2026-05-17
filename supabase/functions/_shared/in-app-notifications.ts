import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type InAppNotificationInput = {
  user_id: string;
  kind: string;
  title: string;
  body: string;
  href?: string | null;
  trade_id?: string | null;
};

export function tradePath(tradeId: string): string {
  return `/trade/${tradeId}`;
}

export function accountPath(hash: "buying" | "selling" | "wallet" | "notifications" = "buying"): string {
  return `/account#${hash}`;
}

/** Best-effort insert; never throws (email flow should continue). */
export async function insertUserNotifications(
  admin: SupabaseClient,
  rows: InAppNotificationInput[],
): Promise<void> {
  if (!rows.length) return;
  const { error } = await admin.from("user_notifications").insert(
    rows.map((row) => ({
      user_id: row.user_id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      href: row.href ?? null,
      trade_id: row.trade_id ?? null,
    })),
  );
  if (error) console.error("[in-app-notifications]", error.message);
}
