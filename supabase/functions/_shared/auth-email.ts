import { sendTransactionalEmail } from "./email-transport.ts";
import { renderAuthEmail } from "./email-template.ts";

export type AuthEmailData = {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new?: string;
  token_hash_new?: string;
};

export type AuthHookUser = {
  email: string;
  new_email?: string | null;
  user_metadata?: Record<string, unknown>;
};

export function buildAuthVerifyUrl(supabaseUrl: string, emailData: AuthEmailData): string {
  const base = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/verify`;
  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: emailData.redirect_to || emailData.site_url,
  });
  return `${base}?${params.toString()}`;
}

function displaySiteUrl(emailData: AuthEmailData): string {
  const fromRedirect = emailData.redirect_to?.trim();
  if (fromRedirect) {
    try {
      return new URL(fromRedirect).origin;
    } catch {
      /* fall through */
    }
  }
  return emailData.site_url.replace(/\/$/, "");
}

function templateForAction(
  action: string,
  verifyUrl: string,
  siteUrl: string,
  otpCode?: string,
): { subject: string; content: Parameters<typeof renderAuthEmail>[0] } {
  const otp = otpCode?.trim() || undefined;

  switch (action) {
    case "signup":
      return {
        subject: "Confirm your EXCH. account",
        content: {
          preheader: "Confirm your email to start buying and selling on EXCH.",
          headline: "Confirm your email",
          paragraphs: [
            "Thanks for signing up. Confirm your email to access your account, place bids, and list items for sale.",
          ],
          cta: { label: "Confirm email", href: verifyUrl },
          otpCode: otp,
          siteUrl,
        },
      };
    case "magiclink":
      return {
        subject: "Sign in to EXCH.",
        content: {
          preheader: "Use this link to sign in to your EXCH. account.",
          headline: "Sign in",
          paragraphs: ["Click below to sign in. This link expires soon."],
          cta: { label: "Sign in", href: verifyUrl },
          otpCode: otp,
          siteUrl,
        },
      };
    case "recovery":
      return {
        subject: "Reset your EXCH. password",
        content: {
          preheader: "Reset your password for EXCH.",
          headline: "Reset password",
          paragraphs: ["We received a request to reset your password. If this was you, use the button below."],
          cta: { label: "Reset password", href: verifyUrl },
          otpCode: otp,
          siteUrl,
        },
      };
    case "invite":
      return {
        subject: "You're invited to EXCH.",
        content: {
          preheader: "Accept your invitation to join EXCH.",
          headline: "You're invited",
          paragraphs: ["You've been invited to create an account on EXCH."],
          cta: { label: "Accept invite", href: verifyUrl },
          otpCode: otp,
          siteUrl,
        },
      };
    case "email_change":
      return {
        subject: "Confirm your email change",
        content: {
          preheader: "Confirm the email change on your EXCH. account.",
          headline: "Confirm email change",
          paragraphs: ["Confirm this change to update the email on your account."],
          cta: { label: "Confirm change", href: verifyUrl },
          otpCode: otp,
          siteUrl,
        },
      };
    case "reauthentication":
      return {
        subject: "Confirm it's you",
        content: {
          preheader: "Verification code for your EXCH. account.",
          headline: "Confirm it's you",
          paragraphs: ["Enter this code to continue with a sensitive account action."],
          otpCode: otp,
          siteUrl,
        },
      };
    default:
      return {
        subject: "EXCH. account notification",
        content: {
          preheader: "Notification from EXCH.",
          headline: "Account notification",
          paragraphs: ["Follow the link below to continue."],
          cta: { label: "Continue", href: verifyUrl },
          otpCode: otp,
          siteUrl,
        },
      };
  }
}

export async function sendAuthHookEmail(params: {
  to: string;
  user: AuthHookUser;
  emailData: AuthEmailData;
  supabaseUrl: string;
}): Promise<void> {
  const siteUrl = displaySiteUrl(params.emailData);
  const verifyUrl = buildAuthVerifyUrl(params.supabaseUrl, params.emailData);
  const { subject, content } = templateForAction(
    params.emailData.email_action_type,
    verifyUrl,
    siteUrl,
    params.emailData.token,
  );

  const { html, text } = renderAuthEmail(content);
  const result = await sendTransactionalEmail({
    to: params.to,
    subject,
    html,
    text,
  });
  if (!result.ok) {
    throw new Error(
      result.error ??
        `Auth email was not sent via ${result.transport} (check NOTIFICATION_FROM_EMAIL and MailerSend).`,
    );
  }
}

/** Secure email change: two OTP/hash pairs — see Supabase send-email hook docs. */
export function authEmailDeliveries(
  user: AuthHookUser,
  emailData: AuthEmailData,
): Array<{ to: string; emailData: AuthEmailData }> {
  if (emailData.email_action_type !== "email_change") {
    return [{ to: user.email, emailData }];
  }

  const hasNewPair = Boolean(emailData.token_new?.trim() && emailData.token_hash_new?.trim());
  if (!hasNewPair) {
    return [{ to: user.new_email ?? user.email, emailData }];
  }

  return [
    {
      to: user.email,
      emailData: {
        ...emailData,
        token: emailData.token,
        token_hash: emailData.token_hash_new,
      },
    },
    {
      to: user.new_email ?? user.email,
      emailData: {
        ...emailData,
        token: emailData.token_new,
        token_hash: emailData.token_hash,
      },
    },
  ];
}
