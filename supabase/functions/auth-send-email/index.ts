import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import {
  authEmailDeliveries,
  type AuthEmailData,
  type AuthHookUser,
  sendAuthHookEmail,
} from "../_shared/auth-email.ts";
import { emailEnvDiagnostics } from "../_shared/send-notification-email.ts";

function webhookHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

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
    const wh = new Webhook(hookSecret());
    const { user, email_data } = wh.verify(payload, webhookHeaders(req)) as HookPayload;

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

    console.log("[auth-send-email] sent", {
      action: email_data.email_action_type,
      to: deliveries.map((d) => d.to),
    });
    return json({});
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[auth-send-email]", message, emailEnvDiagnostics());
    const isVerify =
      message.includes("webhook") ||
      message.includes("signature") ||
      message.includes("SEND_EMAIL_HOOK_SECRET");
    return json(
      { error: { message, hint: isVerify ? "Check Auth Hook secret matches SEND_EMAIL_HOOK_SECRET." : undefined } },
      isVerify ? 401 : 500,
    );
  }
});
