import { getSupabase, isP2pConfigured } from "@/lib/supabase";

export type JoinWaitlistResult = {
  ok: boolean;
  alreadyJoined: boolean;
};

function readableJoinError(message: string): string {
  if (message.includes("email_required")) return "Enter your email address.";
  if (message.includes("invalid_email")) return "Enter a valid email address.";
  if (message.includes("not configured")) return "Waitlist is not configured yet. Try again soon.";
  return message;
}

export async function joinWaitlist(input: {
  email: string;
  name?: string;
  source?: string;
}): Promise<JoinWaitlistResult> {
  if (!isP2pConfigured()) {
    throw new Error("Waitlist is not configured yet.");
  }
  const sb = getSupabase();
  if (!sb) throw new Error("Waitlist is not configured yet.");

  const { data, error } = await sb.rpc("join_waitlist", {
    p_email: input.email.trim(),
    p_name: input.name?.trim() || null,
    p_source: input.source?.trim() || "web",
  });

  if (error) throw new Error(readableJoinError(error.message));

  const row = (data ?? {}) as { ok?: boolean; already_joined?: boolean };
  return {
    ok: Boolean(row.ok),
    alreadyJoined: Boolean(row.already_joined),
  };
}

export type WaitlistSignupRow = {
  id: string;
  created_at: string;
  email: string;
  name: string | null;
  source: string;
};

export async function fetchAdminWaitlist(limit = 500): Promise<WaitlistSignupRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("admin_list_waitlist", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as WaitlistSignupRow[];
}

export async function fetchAdminWaitlistCount(): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const { data, error } = await sb.rpc("admin_waitlist_count");
  if (error) throw error;
  return typeof data === "number" ? data : Number(data ?? 0);
}
