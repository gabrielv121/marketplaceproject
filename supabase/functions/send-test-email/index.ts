import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  emailEnvDiagnostics,
  failureHintForResult,
  prepareTransactionalEmailTest,
  resolveEmailTransport,
  sendTransactionalEmail,
} from "../_shared/email-transport.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  to?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const supabaseAnon = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization" }, 401);

    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceRole);
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle<{ is_admin: boolean }>();
    if (profileErr) return json({ error: profileErr.message }, 500);
    if (!profile?.is_admin) return json({ error: "Admin access required" }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;
    let to = typeof body.to === "string" ? body.to.trim() : "";
    if (!to) to = user.email?.trim() ?? "";
    if (!to) {
      const { data: authUser, error: authLookupErr } = await admin.auth.admin.getUserById(user.id);
      if (!authLookupErr) to = authUser.user?.email?.trim() ?? "";
    }
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return json({
        error: "No valid recipient email. Enter an address in the test field or sign in with an email account.",
        user_id: user.id,
        session_email: user.email ?? null,
      }, 400);
    }

    const transport = resolveEmailTransport();
    const preflight = await prepareTransactionalEmailTest();

    if (preflight.block) {
      return json({
        ok: false,
        transport,
        from: preflight.fromRaw || undefined,
        to,
        config_check: preflight.config_check,
        domains_check: preflight.domains_check,
        auth_hint: preflight.block.auth_hint,
        detail: preflight.block.body,
      }, 400);
    }

    const send = await sendTransactionalEmail({
      to,
      subject: "EXCH. test email",
      html: "<p>This is a test email from your EXCH. Supabase Edge Function.</p>",
      text: "This is a test email from your EXCH. Supabase Edge Function.",
    });

    const auth_hint = failureHintForResult(send, emailEnvDiagnostics());

    return json({
      ok: send.ok,
      transport: send.transport,
      mailersend_status: send.transport === "mailersend_api" ? send.status : undefined,
      smtp_message_id: send.transport === "smtp" ? send.requestId : undefined,
      mailersend_request_id: send.transport === "mailersend_api" ? send.requestId : undefined,
      from: preflight.fromRaw,
      to,
      config_check: preflight.config_check,
      domains_check: preflight.domains_check,
      ...(auth_hint && !send.ok ? { auth_hint } : {}),
      detail: send.body,
    }, send.ok ? 200 : 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
