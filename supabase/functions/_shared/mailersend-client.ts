export type MailerSendFrom = { email: string; name?: string };

export type MailerSendSendInput = {
  from: MailerSendFrom;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type MailerSendDomainInfo = {
  id: string;
  name: string;
  verified: boolean;
};

export type MailerSendSendResult = {
  ok: boolean;
  status: number;
  requestId: string | null;
  body: unknown;
};

const API_BASE = "https://api.mailersend.com/v1";

export function normalizeMailerSendApiKey(raw: string | undefined | null): string {
  if (raw == null) return "";
  let t = raw.trim();
  if (t.length >= 2) {
    const a = t[0];
    const b = t[t.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) t = t.slice(1, -1).trim();
  }
  return t;
}

/** Parses `NOTIFICATION_FROM_EMAIL` values like `EXCH. <orders@domain.com>`. */
export function parseNotificationFromHeader(from: string): MailerSendFrom {
  const trimmed = from.trim();
  const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    const rawName = match[1].trim().replace(/^["']|["']$/g, "");
    const email = match[2].trim();
    return rawName ? { email, name: rawName } : { email };
  }
  return { email: trimmed };
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function mailerSendHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
  }
}

export function mailerSendEnvDiagnostics(): {
  mailersend_key_configured: boolean;
  mailersend_key_prefix_ok: boolean;
  mailersend_key_length: number;
  notification_from_set: boolean;
  notification_from_email: string | null;
  notification_from_domain: string | null;
} {
  const key = normalizeMailerSendApiKey(Deno.env.get("MAILERSEND_API_KEY"));
  const fromRaw = Deno.env.get("NOTIFICATION_FROM_EMAIL")?.trim() ?? "";
  const fromParsed = fromRaw ? parseNotificationFromHeader(fromRaw) : null;
  return {
    mailersend_key_configured: key.length > 0,
    mailersend_key_prefix_ok: key.startsWith("mlsn."),
    mailersend_key_length: key.length,
    notification_from_set: Boolean(fromRaw),
    notification_from_email: fromParsed?.email ?? null,
    notification_from_domain: fromParsed ? emailDomain(fromParsed.email) : null,
  };
}

/** Uses GET /v1/domains to verify the API token and list sending domains. */
export async function listMailerSendDomains(apiKey: string): Promise<{
  ok: boolean;
  status: number;
  domains: MailerSendDomainInfo[];
  body: unknown;
}> {
  const res = await fetch(`${API_BASE}/domains?limit=100`, {
    headers: mailerSendHeaders(apiKey),
  });
  const body = await parseJsonBody(res);
  if (!res.ok) {
    return { ok: false, status: res.status, domains: [], body };
  }

  const domains: MailerSendDomainInfo[] = [];
  if (body && typeof body === "object" && body !== null) {
    const data = (body as { data?: unknown }).data;
    if (Array.isArray(data)) {
      for (const row of data) {
        if (!row || typeof row !== "object") continue;
        const o = row as Record<string, unknown>;
        const name = typeof o.name === "string" ? o.name : "";
        const id = typeof o.id === "string" ? o.id : "";
        if (!name) continue;
        domains.push({
          id,
          name: name.toLowerCase(),
          verified: o.verified === true || o.is_verified === true,
        });
      }
    }
  }

  return { ok: true, status: res.status, domains, body };
}

export function fromDomainAllowed(fromEmail: string, domains: MailerSendDomainInfo[]): boolean {
  const domain = emailDomain(fromEmail);
  if (!domain) return false;
  return domains.some((d) => domain === d.name || domain.endsWith(`.${d.name}`));
}

export function suggestFromForDomains(domains: MailerSendDomainInfo[]): string | null {
  const pick = domains.find((d) => d.name.endsWith(".mlsender.net")) ?? domains[0];
  if (!pick) return null;
  return `EXCH. <noreply@${pick.name}>`;
}

export async function sendMailerSendEmail(
  apiKey: string,
  input: MailerSendSendInput,
): Promise<MailerSendSendResult> {
  const res = await fetch(`${API_BASE}/email`, {
    method: "POST",
    headers: mailerSendHeaders(apiKey),
    body: JSON.stringify({
      from: { email: input.from.email, ...(input.from.name ? { name: input.from.name } : {}) },
      to: [{ email: input.to }],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  const body = await parseJsonBody(res);
  const requestId = res.headers.get("x-message-id") ?? res.headers.get("X-Message-Id") ??
    res.headers.get("x-request-id") ?? res.headers.get("X-Request-Id");

  return {
    ok: res.ok,
    status: res.status,
    requestId,
    body,
  };
}

export function mailerSendFailureHint(
  status: number,
  config: ReturnType<typeof mailerSendEnvDiagnostics>,
  domains: MailerSendDomainInfo[],
): string | undefined {
  if (status === 401) {
    if (!config.mailersend_key_configured) {
      return "MAILERSEND_API_KEY is missing in Supabase Edge secrets (.env.local is not used). Set it under Project Settings → Edge Functions → Secrets.";
    }
    if (!config.mailersend_key_prefix_ok) {
      return "MAILERSEND_API_KEY must start with mlsn. Create a new token in MailerSend (Full access) and update the Supabase secret without extra quotes.";
    }
    return "MailerSend rejected the API token. Create a new Full access token, run: npx supabase@latest secrets set MAILERSEND_API_KEY=mlsn..., then redeploy send-test-email.";
  }
  if (status === 403 || status === 422) {
    if (config.notification_from_domain && domains.length && !fromDomainAllowed(config.notification_from_email ?? "", domains)) {
      const suggestion = suggestFromForDomains(domains);
      return `NOTIFICATION_FROM_EMAIL uses @${config.notification_from_domain}, which is not in your MailerSend domains. ${
        suggestion ? `Try: npx supabase@latest secrets set NOTIFICATION_FROM_EMAIL="${suggestion}"` : "Use an address on a domain listed in MailerSend → Domains."
      }`;
    }
    return "MailerSend blocked the send. Check token permissions, trial recipient limits (2 unique addresses on trial), and that your From domain is verified.";
  }
  return undefined;
}
