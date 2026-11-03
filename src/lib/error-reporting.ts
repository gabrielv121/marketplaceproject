import { getSupabase } from "@/lib/supabase";

type ErrorKind = "error" | "unhandledrejection" | "react";

const MAX_REPORTS_PER_SESSION = 20;
const IGNORED = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /AbortError/i,
  /The user aborted a request/i,
  /Non-Error promise rejection captured/i,
];

const seen = new Set<string>();
let sent = 0;

function reportingEnabled(): boolean {
  if (import.meta.env.PROD) return true;
  try {
    return localStorage.getItem("vrna:report-errors") === "1";
  } catch {
    return false;
  }
}

function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack ?? null };
  if (typeof error === "string") return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

export function reportClientError(kind: ErrorKind, error: unknown, extraStack?: string | null): void {
  if (!reportingEnabled() || sent >= MAX_REPORTS_PER_SESSION) return;
  const { message, stack } = describe(error);
  if (!message || IGNORED.some((re) => re.test(message))) return;
  const fullStack = [stack, extraStack].filter(Boolean).join("\n--- component stack ---\n") || null;
  const key = `${kind}|${message}|${(stack ?? "").split("\n")[1] ?? ""}`;
  if (seen.has(key)) return;
  seen.add(key);
  const sb = getSupabase();
  if (!sb) return;
  sent += 1;
  void sb
    .from("client_errors")
    .insert({
      kind,
      message: message.slice(0, 1000),
      stack: fullStack ? fullStack.slice(0, 4000) : null,
      path: `${window.location.pathname}${window.location.search}`.slice(0, 500),
      user_agent: navigator.userAgent.slice(0, 400),
      release: __APP_RELEASE__,
    })
    .then(() => undefined);
}

export function installErrorReporting(): void {
  window.addEventListener("error", (event) => {
    reportClientError("error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportClientError("unhandledrejection", event.reason);
  });
}

export type ClientErrorRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  kind: ErrorKind;
  message: string;
  stack: string | null;
  path: string | null;
  user_agent: string | null;
  release: string | null;
};

export async function fetchClientErrors(sinceIso: string | null, limit = 300): Promise<ClientErrorRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  let q = sb
    .from("client_errors")
    .select("id,created_at,user_id,kind,message,stack,path,user_agent,release")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ClientErrorRow[];
}

export async function clearClientErrors(): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("client_errors").delete().lte("created_at", new Date().toISOString());
  if (error) throw error;
}
