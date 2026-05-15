import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const expected = Deno.env.get("CLEANUP_SECRET");
  if (!expected) {
    return new Response(JSON.stringify({ error: "Missing CLEANUP_SECRET" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const provided = req.headers.get("x-cleanup-secret");
  if (provided !== expected) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ error: "Missing Supabase secrets" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  let minutes = 30;
  try {
    const body = await req.json();
    if (typeof body?.minutes === "number") {
      minutes = Math.max(5, Math.min(24 * 60, Math.floor(body.minutes)));
    }
  } catch {
    // Body is optional.
  }

  const admin = createClient(supabaseUrl, serviceRole);
  const { data, error } = await admin.rpc("cleanup_stale_reserved_trades", {
    p_older_than: `${minutes} minutes`,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ released: data ?? 0, older_than_minutes: minutes }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
