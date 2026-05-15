import {
  emailEnvDiagnostics,
  normalizeMailerSendApiKey,
  parseNotificationFromHeader,
  resolveEmailTransport,
  sendTransactionalEmail,
} from "./email-transport.ts";

export type NotificationEmailInput = {
  to?: string | null;
  subject: string;
  html: string;
  text: string;
};

export {
  emailEnvDiagnostics,
  normalizeMailerSendApiKey,
  parseNotificationFromHeader,
  resolveEmailTransport,
} from "./email-transport.ts";
export { mailerSendEnvDiagnostics } from "./mailersend-client.ts";
export { smtpEnvDiagnostics } from "./smtp-client.ts";

type PostResult =
  | { kind: "skip"; hasKey: boolean; hasFrom: boolean; skipReason: string }
  | { kind: "fail"; error: string }
  | { kind: "ok" };

async function postEmail(message: NotificationEmailInput): Promise<PostResult> {
  const fromRaw = Deno.env.get("NOTIFICATION_FROM_EMAIL")?.trim();
  const to = message.to?.trim() ?? "";
  const transport = resolveEmailTransport();
  const smtpPass = (Deno.env.get("SMTP_PASSWORD") ?? Deno.env.get("SMTP_PASS"))?.trim();
  const smtpReady = Boolean(Deno.env.get("SMTP_USER")?.trim() && smtpPass);
  const apiKey = normalizeMailerSendApiKey(Deno.env.get("MAILERSEND_API_KEY"));

  if (!fromRaw || !to) {
    return {
      kind: "skip",
      hasKey: transport === "smtp" ? smtpReady : Boolean(apiKey),
      hasFrom: Boolean(fromRaw),
      skipReason: "Email skipped because sender (NOTIFICATION_FROM_EMAIL), recipient, or transport credentials are missing.",
    };
  }

  if (transport === "mailersend_api" && !apiKey) {
    return {
      kind: "skip",
      hasKey: false,
      hasFrom: true,
      skipReason: "Email skipped because MAILERSEND_API_KEY is missing (use SMTP secrets or set the API key).",
    };
  }

  const recipient = to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { kind: "fail", error: `Invalid recipient email: ${JSON.stringify(message.to)}` };
  }

  const result = await sendTransactionalEmail({
    to: recipient,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });

  if (!result.ok) {
    const detail = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
    return {
      kind: "fail",
      error: result.error ?? `${result.transport} failed: ${detail}`,
    };
  }
  return { kind: "ok" };
}

/** Sends order/label notifications via SMTP or MailerSend API (see EMAIL_TRANSPORT). */
export async function sendNotificationEmail(
  message: NotificationEmailInput,
  options?: { silentSkip?: boolean },
): Promise<void> {
  const result = await postEmail(message);
  if (result.kind === "skip") {
    if (!options?.silentSkip) {
      console.log("email skipped", {
        transport: resolveEmailTransport(),
        hasKey: result.hasKey,
        hasFrom: result.hasFrom,
        to: message.to,
        subject: message.subject,
      });
    }
    return;
  }
  if (result.kind === "fail") {
    console.error("email send failed", message.subject, result.error);
  }
}

export async function tryNotificationEmail(
  message: NotificationEmailInput,
): Promise<{ sent: boolean; error?: string }> {
  const result = await postEmail(message);
  if (result.kind === "skip") return { sent: false, error: result.skipReason };
  if (result.kind === "fail") return { sent: false, error: result.error };
  return { sent: true };
}
