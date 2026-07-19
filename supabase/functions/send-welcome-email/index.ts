import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { renderAuthEmail } from "../_shared/email-template.ts";
import { sendTransactionalEmail } from "../_shared/email-transport.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  site_url?: string;
  /** welcome (default) or reminder — same email, slightly different copy */
  reason?: "welcome" | "reminder";
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email_verified: boolean;
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

function normalizeSiteUrl(raw: string | undefined): string {
  const fallback = Deno.env.get("CHECKOUT_SITE_URL")?.trim() || "https://marketplaceproject-two.vercel.app";
  const candidate = (raw?.trim() || fallback).replace(/\/$/, "");
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return fallback;
    return u.origin;
  } catch {
    return fallback.replace(/\/$/, "");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadProfileWithRetry(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<ProfileRow | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, display_name, email_verified")
      .eq("id", userId)
      .maybeSingle<ProfileRow>();
    if (error) throw new Error(error.message);
    if (data) return data;
    await sleep(250 * (attempt + 1));
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const supabaseAnon = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization" }, 401);

    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    const email = user.email?.trim();
    if (!email) return json({ error: "Account has no email address" }, 400);

    const body = (await req.json().catch(() => ({}))) as Body;
    const siteUrl = normalizeSiteUrl(body.site_url);
    const reason = body.reason === "reminder" ? "reminder" : "welcome";

    const admin = createClient(supabaseUrl, serviceRole);
    const profile = await loadProfileWithRetry(admin, user.id);
    if (!profile) return json({ error: "Profile not found" }, 404);

    // Reminder is only for unverified accounts. Welcome always sends (even if already verified).
    if (reason === "reminder" && profile.email_verified) {
      return json({ ok: true, already_verified: true, sent: false });
    }

    const name = profile.display_name?.trim() || email.split("@")[0] || "there";
    const needsVerify = !profile.email_verified;

    let verifyUrl: string | null = null;
    if (needsVerify) {
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const { error: updateErr } = await admin
        .from("profiles")
        .update({
          email_verify_token: token,
          email_verify_token_expires_at: expiresAt,
        })
        .eq("id", user.id);
      if (updateErr) return json({ error: updateErr.message }, 500);
      verifyUrl = `${siteUrl}/verify-email?token=${encodeURIComponent(token)}`;
    }

    const subject = reason === "reminder" ? "Verify your email to buy and sell on VRNA" : "Welcome to VRNA";
    const headline = reason === "reminder" ? "Verify your email" : "Welcome to VRNA";
    const paragraphs =
      reason === "reminder"
        ? [
            `Hi ${name}, verify your email to place bids, buy from peers, and list items for sale.`,
            "You can browse the catalog anytime. Verification only unlocks trading.",
          ]
        : needsVerify
          ? [
              `Hi ${name}, your VRNA account is ready. You're signed in and can browse the catalog right away.`,
              "When you're ready to buy, bid, or list an item, verify your email with the button below (optional until then).",
            ]
          : [
              `Hi ${name}, welcome back to VRNA. You're signed in and ready to browse the catalog.`,
              "Your email is already verified, so you can buy, bid, and list whenever you're ready.",
            ];

    const { html, text } = renderAuthEmail({
      preheader:
        reason === "reminder"
          ? "Verify your email to trade on VRNA"
          : needsVerify
            ? "Your VRNA account is ready"
            : "Welcome back to VRNA",
      headline,
      paragraphs,
      cta: verifyUrl
        ? { label: "Verify email", href: verifyUrl }
        : { label: "Browse VRNA", href: siteUrl },
      siteUrl,
    });

    const result = await sendTransactionalEmail({
      to: email,
      subject,
      html,
      text,
    });

    if (!result.ok) {
      return json(
        {
          error: result.error ?? "Failed to send welcome email",
          transport: result.transport,
        },
        502,
      );
    }

    return json({
      ok: true,
      sent: true,
      reason,
      already_verified: profile.email_verified,
      transport: result.transport,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});
