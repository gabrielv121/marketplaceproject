import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { formatMoney, renderOrderEmail } from "../_shared/email-template.ts";
import { tryNotificationEmail } from "../_shared/send-notification-email.ts";
import { emailForUser, loadProductCard, resolveSiteUrl } from "../_shared/trade-email-data.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ClaimedAlert = {
  id: string;
  user_id: string;
  product_handle: string;
  size_label: string;
  target_cents: number;
  triggered_price_cents: number | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

/**
 * Emails owners of price alerts that fired and have not been emailed yet.
 * Safe to call any number of times: each alert is claimed (emailed_at set) before its email goes out.
 * Called by the size-price jobs and by the app after a listing is created or repriced.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const body = (await req.json().catch(() => ({}))) as { site_url?: string };
    const siteUrl = resolveSiteUrl(body.site_url);
    const since = new Date(Date.now() - 2 * 86_400_000).toISOString();

    const { data: pending, error: pendingErr } = await admin
      .from("price_alerts")
      .select("id")
      .eq("status", "triggered")
      .is("emailed_at", null)
      .gte("triggered_at", since)
      .order("triggered_at", { ascending: true })
      .limit(50);
    if (pendingErr) return json({ error: pendingErr.message }, 500);
    if (!pending?.length) return json({ ok: true, sent: 0 });

    const { data: claimed, error: claimErr } = await admin
      .from("price_alerts")
      .update({ emailed_at: new Date().toISOString() })
      .in(
        "id",
        pending.map((row) => row.id),
      )
      .is("emailed_at", null)
      .select("id,user_id,product_handle,size_label,target_cents,triggered_price_cents");
    if (claimErr) return json({ error: claimErr.message }, 500);

    let sent = 0;
    const failures: string[] = [];
    for (const alert of (claimed ?? []) as ClaimedAlert[]) {
      const to = await emailForUser(admin, alert.user_id);
      if (!to) continue;
      const product = await loadProductCard(admin, alert.product_handle, alert.size_label, siteUrl);
      const price = formatMoney(alert.triggered_price_cents ?? alert.target_cents);
      const target = formatMoney(alert.target_cents);
      const { html, text } = renderOrderEmail({
        preheader: `${product.title} in size ${alert.size_label} is now ${price}.`,
        headline: "Your price alert hit",
        paragraphs: [
          `${product.title} in size ${alert.size_label} just dropped to ${price}, at or below your ${target} alert.`,
          "Prices move fast. If you want it, grab it before someone else does.",
        ],
        product,
        orderRows: [
          { label: "Size", value: alert.size_label },
          { label: "Your alert", value: target },
          { label: "Lowest ask now", value: price, emphasis: true },
        ],
        cta: { label: "View and buy", href: product.productUrl },
        secondaryCta: { label: "Manage price alerts", href: `${product.siteUrl}/account#buying` },
      });
      const result = await tryNotificationEmail({ to, subject: `Price drop: ${product.title} is now ${price}`, html, text });
      if (result.sent) sent += 1;
      else failures.push(`${alert.id}: ${result.error ?? "not sent"}`);
    }

    if (failures.length) console.error("price alert emails failed", failures);
    return json({ ok: true, claimed: claimed?.length ?? 0, sent, failed: failures.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
