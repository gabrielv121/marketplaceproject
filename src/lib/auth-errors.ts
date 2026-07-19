/** Map Supabase Auth API errors to clearer copy for the UI. */
export function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("email rate limit")) {
    return (
      "Too many auth emails were sent from this project (Supabase rate limit). " +
      "Wait about an hour, or open Supabase → Authentication → Rate Limits and increase email / signup limits."
    );
  }
  if (
    lower.includes("confirmation mail") ||
    lower.includes("error sending") ||
    (lower.includes("hook") && (lower.includes("500") || lower.includes("401")))
  ) {
    return (
      "Could not send an auth email (hook failed). Check Authentication → Auth Hooks → Send Email, " +
      "Edge Function secrets for MailerSend, and Admin → Send test email."
    );
  }
  return message;
}
