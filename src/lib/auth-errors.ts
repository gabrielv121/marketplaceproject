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
  if (lower.includes("hook") && lower.includes("500")) {
    return "Could not send the confirmation email. Check Edge Functions → auth-send-email logs and MailerSend settings.";
  }
  return message;
}
