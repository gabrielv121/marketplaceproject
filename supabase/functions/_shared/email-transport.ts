import {
  listMailerSendDomains,
  mailerSendEnvDiagnostics,
  mailerSendFailureHint,
  parseNotificationFromHeader,
  sendMailerSendEmail,
  fromDomainAllowed,
  suggestFromForDomains,
  normalizeMailerSendApiKey,
  type MailerSendFrom,
} from "./mailersend-client.ts";
import { sendSmtpEmail, smtpEnvDiagnostics, smtpFailureHint } from "./smtp-client.ts";

export type { MailerSendFrom } from "./mailersend-client.ts";
export {
  mailerSendEnvDiagnostics,
  normalizeMailerSendApiKey,
  parseNotificationFromHeader,
} from "./mailersend-client.ts";
export { smtpEnvDiagnostics } from "./smtp-client.ts";

export type EmailTransport = "smtp" | "mailersend_api";

export type TransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type TransactionalEmailResult = {
  ok: boolean;
  transport: EmailTransport;
  status: number;
  requestId: string | null;
  body: unknown;
  error?: string;
};

/** Prefer SMTP when EMAIL_TRANSPORT=smtp or SMTP_USER + SMTP_PASSWORD are set. */
export function resolveEmailTransport(): EmailTransport {
  const mode = Deno.env.get("EMAIL_TRANSPORT")?.trim().toLowerCase();
  if (mode === "smtp" || mode === "mailersend_smtp") return "smtp";
  if (mode === "api" || mode === "mailersend" || mode === "mailersend_api") return "mailersend_api";

  const smtpUser = Deno.env.get("SMTP_USER")?.trim();
  const smtpPass = (Deno.env.get("SMTP_PASSWORD") ?? Deno.env.get("SMTP_PASS"))?.trim();
  if (smtpUser && smtpPass) return "smtp";

  return "mailersend_api";
}

export function emailEnvDiagnostics(): Record<string, unknown> {
  const transport = resolveEmailTransport();
  const fromRaw = Deno.env.get("NOTIFICATION_FROM_EMAIL")?.trim() ?? "";
  const fromParsed = fromRaw ? parseNotificationFromHeader(fromRaw) : null;
  return {
    transport,
    notification_from_set: Boolean(fromRaw),
    notification_from_email: fromParsed?.email ?? null,
    ...(transport === "smtp" ? smtpEnvDiagnostics() : mailerSendEnvDiagnostics()),
  };
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmailResult> {
  const fromRaw = Deno.env.get("NOTIFICATION_FROM_EMAIL")?.trim();
  if (!fromRaw) {
    return {
      ok: false,
      transport: resolveEmailTransport(),
      status: 0,
      requestId: null,
      body: null,
      error: "Missing NOTIFICATION_FROM_EMAIL",
    };
  }

  return sendTransactionalEmailWithFallback(input);
}

async function sendViaTransport(
  transport: EmailTransport,
  from: MailerSendFrom,
  input: TransactionalEmailInput,
): Promise<TransactionalEmailResult> {
  if (transport === "smtp") {
    const smtp = await sendSmtpEmail({ from, to: input.to, subject: input.subject, html: input.html, text: input.text });
    return {
      ok: smtp.ok,
      transport: "smtp",
      status: smtp.ok ? 200 : 0,
      requestId: smtp.messageId ?? null,
      body: smtp.ok ? { message: "Sent via SMTP" } : { message: smtp.error },
      error: smtp.ok ? undefined : smtp.error,
    };
  }

  const apiKey = normalizeMailerSendApiKey(Deno.env.get("MAILERSEND_API_KEY"));
  if (!apiKey) {
    return {
      ok: false,
      transport: "mailersend_api",
      status: 0,
      requestId: null,
      body: null,
      error: "Missing MAILERSEND_API_KEY",
    };
  }

  const result = await sendMailerSendEmail(apiKey, { from, ...input });
  return {
    ok: result.ok,
    transport: "mailersend_api",
    status: result.status,
    requestId: result.requestId,
    body: result.body,
    error: result.ok ? undefined : (typeof result.body === "string" ? result.body : `MailerSend HTTP ${result.status}`),
  };
}

/** SMTP in Edge Functions can fail; fall back to MailerSend HTTP API when configured. */
export async function sendTransactionalEmailWithFallback(
  input: TransactionalEmailInput,
): Promise<TransactionalEmailResult> {
  const fromRaw = Deno.env.get("NOTIFICATION_FROM_EMAIL")?.trim();
  if (!fromRaw) {
    return {
      ok: false,
      transport: resolveEmailTransport(),
      status: 0,
      requestId: null,
      body: null,
      error: "Missing NOTIFICATION_FROM_EMAIL",
    };
  }

  const from = parseNotificationFromHeader(fromRaw);
  const primary = resolveEmailTransport();
  const primaryResult = await sendViaTransport(primary, from, input);
  if (primaryResult.ok) return primaryResult;

  const fallback: EmailTransport = primary === "smtp" ? "mailersend_api" : "smtp";
  const canFallback =
    fallback === "mailersend_api"
      ? Boolean(normalizeMailerSendApiKey(Deno.env.get("MAILERSEND_API_KEY")))
      : Boolean(Deno.env.get("SMTP_USER")?.trim() && (Deno.env.get("SMTP_PASSWORD") ?? Deno.env.get("SMTP_PASS"))?.trim());

  if (!canFallback) {
    return {
      ...primaryResult,
      error: primaryResult.error ?? "Email send failed",
    };
  }

  const fallbackResult = await sendViaTransport(fallback, from, input);
  if (fallbackResult.ok) return fallbackResult;

  return {
    ...fallbackResult,
    error: `${primary} failed (${primaryResult.error ?? "unknown"}); ${fallback} failed (${fallbackResult.error ?? "unknown"})`,
  };
}

/** Preflight + hints for admin test endpoint. */
export async function prepareTransactionalEmailTest(): Promise<{
  fromRaw: string;
  fromParsed: MailerSendFrom;
  config_check: Record<string, unknown>;
  domains_check?: Record<string, unknown>;
  block?: { auth_hint: string; body: unknown; status: number };
}> {
  const fromRaw = Deno.env.get("NOTIFICATION_FROM_EMAIL")?.trim() ?? "";
  if (!fromRaw) {
    return {
      fromRaw: "",
      fromParsed: { email: "" },
      config_check: emailEnvDiagnostics(),
      block: {
        auth_hint: "Set NOTIFICATION_FROM_EMAIL in Supabase Edge secrets (verified domain address).",
        body: { message: "Missing NOTIFICATION_FROM_EMAIL" },
        status: 0,
      },
    };
  }

  const fromParsed = parseNotificationFromHeader(fromRaw);
  const config_check = emailEnvDiagnostics();
  const transport = resolveEmailTransport();

  if (transport === "smtp") {
    const smtp = smtpEnvDiagnostics();
    if (!smtp.smtp_configured) {
      return {
        fromRaw,
        fromParsed,
        config_check,
        block: {
          auth_hint: smtpFailureHint(config_check),
          body: { message: "SMTP is not fully configured" },
          status: 0,
        },
      };
    }
    return { fromRaw, fromParsed, config_check };
  }

  const apiKey = normalizeMailerSendApiKey(Deno.env.get("MAILERSEND_API_KEY"));
  if (!apiKey) {
    return {
      fromRaw,
      fromParsed,
      config_check,
      block: {
        auth_hint:
          "Set MAILERSEND_API_KEY or switch to SMTP (SMTP_USER, SMTP_PASSWORD, EMAIL_TRANSPORT=smtp).",
        body: { message: "Missing MAILERSEND_API_KEY" },
        status: 0,
      },
    };
  }

  const domainList = await listMailerSendDomains(apiKey);
  const domains = domainList.domains.map((d) => ({ name: d.name, verified: d.verified }));
  const suggested_from = domainList.ok ? suggestFromForDomains(domainList.domains) : null;
  const from_domain_ok = domainList.ok ? fromDomainAllowed(fromParsed.email, domainList.domains) : null;

  const domains_check = {
    ok: domainList.ok,
    status: domainList.status,
    domains,
    from_domain_ok,
    suggested_from,
    body: domainList.ok ? undefined : domainList.body,
  };

  if (!domainList.ok) {
    return {
      fromRaw,
      fromParsed,
      config_check,
      domains_check,
      block: {
        auth_hint: mailerSendFailureHint(domainList.status, mailerSendEnvDiagnostics(), []) ?? "MailerSend API check failed",
        body: domainList.body,
        status: domainList.status,
      },
    };
  }

  if (from_domain_ok === false) {
    return {
      fromRaw,
      fromParsed,
      config_check,
      domains_check,
      block: {
        auth_hint: mailerSendFailureHint(422, mailerSendEnvDiagnostics(), domainList.domains) ??
          "From domain does not match MailerSend domains",
        body: {
          message: `From @${config_check.notification_from_domain} is not a sending domain on this MailerSend account.`,
          suggested_from,
        },
        status: 422,
      },
    };
  }

  return { fromRaw, fromParsed, config_check, domains_check };
}

export function failureHintForResult(
  result: TransactionalEmailResult,
  config_check: Record<string, unknown>,
): string | undefined {
  if (result.ok) return undefined;
  if (result.transport === "smtp") {
    return smtpFailureHint(config_check) ?? result.error;
  }
  return mailerSendFailureHint(result.status, mailerSendEnvDiagnostics(), []) ?? result.error;
}
