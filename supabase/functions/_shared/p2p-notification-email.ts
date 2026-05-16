import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendBidMatchEmails as sendBidMatchEmailsImpl, type BidMatchTrade } from "./order-emails.ts";
export { emailForUser, resolveSiteUrl } from "./trade-email-data.ts";
export type { BidMatchTrade };

export async function sendBidMatchEmails(
  admin: SupabaseClient,
  trade: BidMatchTrade,
  siteUrl: string,
): Promise<void> {
  await sendBidMatchEmailsImpl(admin, trade, siteUrl);
}
