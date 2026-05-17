import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import {
  authEmailDeliveries,
  type AuthEmailData,
  type AuthHookUser,
  sendAuthHookEmail,
} from "../_shared/auth-email.ts";
import { emailEnvDiagnostics } from "../_shared/send-notification-email.ts";

function webhookHeaders(req: Request): Record<string, string> {
  return Object.fromEntries(req.headers);
}

function isWebhookVerificationError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("signature") ||
    m.includes("webhook") ||
    m.includes("timestamp") ||
    m.includes("missing required header") ||
    m.includes("send_email_hook_secret")
  );
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
    const diag = emailEnvDiagnostics();
    console.error("[auth-send-email]", message, diag);
    const isVerify = isWebhookVerificationError(message);
    const isEmail =
      message.includes("Auth email was not sent") ||
      message.includes("Email send failed") ||
      message.includes("SMTP") ||
      message.includes("MailerSend");
    return json(
      {
        error: {
          message,
          transport: diag.transport,
          hint: isVerify
            ? "Regenerate the secret under Authentication → Auth Hooks → Send Email, then run: npx supabase@latest secrets set SEND_EMAIL_HOOK_SECRET=v1,whsec_... (full value, including prefix)."
            : isEmail
              ? "SMTP/API send failed inside the hook. Confirm Admin → Send test email works and check function logs."
              : undefined,
        },
      },
      isVerify ? 401 : 500,
    );
  }
});
