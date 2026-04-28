// Edge function: invite-agent
// Admin-only. Sends a Supabase auth invite email and creates a user_roles row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify caller is an admin
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role,status")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!roleRow || roleRow.role !== "admin" || roleRow.status !== "active") {
    return json({ error: "Forbidden — admin only" }, 403);
  }

  let body: { email?: string; full_name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const full_name = (body.full_name ?? "").trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "Valid email required" }, 400);
  }
  if (!full_name) return json({ error: "Full name required" }, 400);

  // Determine redirect URL from origin header
  const origin = req.headers.get("origin") ?? "";
  const redirectTo = origin ? `${origin}/` : undefined;

  // Send invite (creates auth user if not existing)
  const { data: inviteData, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo,
    });

  let invitedUserId: string | undefined = inviteData?.user?.id;

  // If user already exists, inviteUserByEmail errors. Look up the user instead.
  if (inviteErr) {
    const msg = inviteErr.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = list?.users.find((u) => u.email?.toLowerCase() === email);
      if (!found) return json({ error: inviteErr.message }, 400);
      invitedUserId = found.id;
    } else {
      return json({ error: inviteErr.message }, 400);
    }
  }

  if (!invitedUserId) return json({ error: "Invite failed" }, 500);

  // Upsert user_roles row
  const { error: upsertErr } = await admin.from("user_roles").upsert(
    {
      user_id: invitedUserId,
      role: "agent",
      status: "active",
      invited_by: userData.user.id,
      invited_at: new Date().toISOString(),
      full_name,
      email,
    },
    { onConflict: "user_id" },
  );
  if (upsertErr) return json({ error: upsertErr.message }, 500);

  return json({ ok: true, user_id: invitedUserId });
});
