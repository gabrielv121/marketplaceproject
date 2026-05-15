import nodemailer from "npm:nodemailer@6.9.16";
import { emailDomain, parseNotificationFromHeader, type MailerSendFrom } from "./mailersend-client.ts";

export type SmtpSendInput = {
  from: MailerSendFrom;
  to: string;
  subject: string;
  html: string;
  text: string;
};

function normalizeSecret(raw: string | undefined | null): string {
  if (raw == null) return "";
  let t = raw.trim();
  if (t.length >= 2) {
    const a = t[0];
    const b = t[t.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) t = t.slice(1, -1).trim();
  }
  return t;
}

function formatFromAddress(from: MailerSendFrom): string {
  if (from.name) return `"${from.name.replace(/"/g, '\\"')}" <${from.email}>`;
  return from.email;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns a single RFC-like address or null if missing/invalid. */
export function normalizeRecipient(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/<([^>]+)>/);
  const email = (match ? match[1] : trimmed).trim();
  return EMAIL_RE.test(email) ? email : null;
}

export function smtpEnvDiagnostics(): Record<string, unknown> {
  const host = Deno.env.get("SMTP_HOST")?.trim() || "smtp.mailersend.net";
  const portRaw = Deno.env.get("SMTP_PORT")?.trim() || "587";
  const user = Deno.env.get("SMTP_USER")?.trim() ?? "";
  const pass = normalizeSecret(Deno.env.get("SMTP_PASSWORD") ?? Deno.env.get("SMTP_PASS"));
  const port = Number(portRaw);
  return {
    smtp_host: host,
    smtp_port: Number.isFinite(port) ? port : portRaw,
    smtp_user_set: user.length > 0,
    smtp_password_set: pass.length > 0,
    smtp_configured: Boolean(user && pass && host),
    smtp_secure: Deno.env.get("SMTP_SECURE")?.trim() === "true" || port === 465,
  };
}

export function smtpFailureHint(_config: Record<string, unknown>): string | undefined {
  const d = smtpEnvDiagnostics();
  if (!d.smtp_user_set || !d.smtp_password_set) {
    return "SMTP_USER and SMTP_PASSWORD must be set in Supabase Edge secrets (.env.local is not used). MailerSend: Domains → your domain → SMTP → Generate new user.";
  }
  return "SMTP send failed. Check host smtp.mailersend.net, port 587, credentials, and that NOTIFICATION_FROM_EMAIL uses your verified domain (not the SMTP username).";
}

export async function sendSmtpEmail(
  input: SmtpSendInput,
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const host = Deno.env.get("SMTP_HOST")?.trim() || "smtp.mailersend.net";
  const port = Number(Deno.env.get("SMTP_PORT")?.trim() || "587");
  const user = Deno.env.get("SMTP_USER")?.trim() ?? "";
  const pass = normalizeSecret(Deno.env.get("SMTP_PASSWORD") ?? Deno.env.get("SMTP_PASS"));
  const secure = Deno.env.get("SMTP_SECURE")?.trim() === "true" || port === 465;

  if (!user || !pass) {
    return { ok: false, error: "SMTP_USER and SMTP_PASSWORD are required for SMTP transport." };
  }

  const to = normalizeRecipient(input.to);
  if (!to) {
    return {
      ok: false,
      error: `Invalid or missing recipient (got ${JSON.stringify(input.to)}). Use a full email like you@example.com.`,
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });

  try {
    const info = await transporter.sendMail({
      from: formatFromAddress(input.from),
      to,
      envelope: { from: input.from.email, to },
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  } finally {
    transporter.close();
  }
}

/** Re-export for tests that only need from parsing on SMTP path. */
export { parseNotificationFromHeader, emailDomain };
