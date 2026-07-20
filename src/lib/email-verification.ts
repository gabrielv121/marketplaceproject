import { getSupabase, getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase";

export type EmailVerificationProfile = {
  email_verified: boolean;
};

export function isEmailVerified(profile: EmailVerificationProfile | null | undefined): boolean {
  return Boolean(profile?.email_verified);
}

export async function fetchEmailVerified(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data: userData } = await sb.auth.getUser();
  if (!userData.user) return false;
  const { data, error } = await sb
    .from("profiles")
    .select("email_verified")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.email_verified);
}

export async function confirmEmailVerification(token: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.rpc("confirm_email_verification", { p_token: token.trim() });
  if (error) {
    const raw = error.message ?? "";
    if (raw.includes("invalid_or_expired_verify_token") || raw.includes("invalid_verify_token")) {
      throw new Error("This verification link is invalid or expired. Request a new one from your account.");
    }
    if (raw.includes("not_authenticated")) {
      throw new Error("Sign in with the same account, then open the verification link again.");
    }
    throw new Error(raw || "Could not verify email");
  }
}

export async function requestWelcomeOrVerifyEmail(opts?: {
  reason?: "welcome" | "reminder";
  siteUrl?: string;
  /** Prefer the token from signup/sign-in when getSession may still be empty. */
  accessToken?: string;
}): Promise<{ sent: boolean; alreadyVerified: boolean }> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  let accessToken = opts?.accessToken?.trim() || "";
  if (!accessToken) {
    const {
      data: { session },
    } = await sb.auth.getSession();
    accessToken = session?.access_token ?? "";
  }
  if (!accessToken) throw new Error("Sign in to verify your email");

  const response = await fetch(`${getSupabaseUrl()}/functions/v1/send-welcome-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: getSupabaseAnonKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: opts?.reason ?? "welcome",
      site_url: opts?.siteUrl ?? window.location.origin,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    sent?: boolean;
    already_verified?: boolean;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not send verification email");
  }

  return {
    sent: Boolean(payload.sent),
    alreadyVerified: Boolean(payload.already_verified),
  };
}

export const EMAIL_VERIFY_REQUIRED_MESSAGE =
  "Verify your email to buy, bid, or list. Check your inbox or resend the link from Account.";
