/** Map Supabase Auth API errors to clearer copy for the UI. */
export function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("email rate limit")) {
    return (
      "Too many auth emails were sent from this project (Supabase rate limit). " +
      "Wait about an hour, or open Supabase → Authentication → Rate Limits and increase email / signup limits. " +
      "For local testing you can turn off Confirm email under Authentication → Providers → Email."
    );
  }
  if (
    lower.includes("confirmation mail") ||
    lower.includes("error sending") ||
    (lower.includes("hook") && (lower.includes("500") || lower.includes("401")))
  ) {
    return (
      "Could not send the confirmation email (auth hook failed). In Supabase: Authentication → Auth Hooks → Send Email — confirm the URL is …/auth-send-email, then regenerate the hook secret and run: npx supabase@latest secrets set SEND_EMAIL_HOOK_SECRET=v1,whsec_... (full value). Also check Edge Functions → auth-send-email → Logs and that Admin → Send test email succeeds."
    );
  }
  return message;
}
