import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const NOTIFICATION_RETENTION = "7 days";

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
  let purgeNotifications = false;
  try {
    const body = await req.json();
    if (typeof body?.minutes === "number") {
      minutes = Math.max(5, Math.min(24 * 60, Math.floor(body.minutes)));
    }
    if (body?.purge_notifications === true) {
      purgeNotifications = true;
    }
  } catch {
    // Body is optional.
  }

  const admin = createClient(supabaseUrl, serviceRole);

  const { data: released, error: tradeError } = await admin.rpc("cleanup_stale_reserved_trades", {
    p_older_than: `${minutes} minutes`,
  });

  if (tradeError) {
    return new Response(JSON.stringify({ error: tradeError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let notificationsDeleted: number | null = null;
  let notificationsError: string | null = null;

  if (purgeNotifications) {
    const { data, error } = await admin.rpc("cleanup_old_user_notifications", {
      p_older_than: NOTIFICATION_RETENTION,
    });
    if (error) {
      notificationsError = error.message;
    } else {
      notificationsDeleted = typeof data === "number" ? data : 0;
    }
  }

  return new Response(
    JSON.stringify({
      released: released ?? 0,
      older_than_minutes: minutes,
      notifications_deleted: notificationsDeleted,
      notification_retention: NOTIFICATION_RETENTION,
      notifications_error: notificationsError,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
