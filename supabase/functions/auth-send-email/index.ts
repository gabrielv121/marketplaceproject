import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import {
  authEmailDeliveries,
  type AuthEmailData,
  type AuthHookUser,
  sendAuthHookEmail,
} from "../_shared/auth-email.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hookSecret(): string {
  const raw = Deno.env.get("SEND_EMAIL_HOOK_SECRET")?.trim();
  if (!raw) throw new Error("Missing SEND_EMAIL_HOOK_SECRET");
  return raw.replace(/^v1,whsec_/, "");
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

type HookPayload = {
  user: AuthHookUser & { email: string };
  email_data: AuthEmailData;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const payload = await req.text();
    const headers = Object.fromEntries(req.headers);
    const wh = new Webhook(hookSecret());
    const { user, email_data } = wh.verify(payload, headers) as HookPayload;

    if (!user?.email) {
      return json({ error: { message: "Missing user email" } }, 400);
    }

    const deliveries = authEmailDeliveries(user, email_data);
    for (const delivery of deliveries) {
      await sendAuthHookEmail({
        to: delivery.to,
        user,
        emailData: delivery.emailData,
        supabaseUrl,
      });
    }

    return json({});
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[auth-send-email]", message);
    return json({ error: { message } }, 401);
  }
});
