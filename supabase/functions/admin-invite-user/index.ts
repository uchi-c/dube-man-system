// supabase/functions/admin-invite-user/index.ts
//
// Admin-only: creates a teammate's Supabase Auth account immediately with a
// one-time temporary password (instead of the link-based invite flow, where
// the invitee has to open a link and complete their own signup — reported
// live as unreliable when the link opened but landed back on sign-in) and
// enrolls them into the caller's organization with the chosen role.
//
// Runs with a service-privileged key because creating an auth account with
// a password requires Supabase Auth's admin API — something no plain
// Postgres RPC can do (passwords are hashed/managed by GoTrue, not
// something a SQL function can set directly). Authorization is NOT
// reimplemented here: it delegates to the existing create_organization_invite
// RPC, called under the *caller's own* JWT, which already enforces "must be
// an ADMIN" and resolves "their own organization" — this function only ever
// acts on whatever org_id that RPC resolved, never one supplied by the
// client directly.
//
// Key resolution: this project has been migrated to Supabase's newer
// publishable/secret API key system (sb_publishable_.../sb_secret_...).
// The legacy SUPABASE_SERVICE_ROLE_KEY is still a JWT signed against the
// project's *old* shared JWT secret, which GoTrue's admin API rejects
// outright once JWT signing keys have moved on — reproduced live as
// "invalid JWT ... unrecognized JWT kid <nil> for algorithm ES256" on
// every invite attempt. SUPABASE_SECRET_KEYS (a JSON map of named secret
// keys, not a JWT) is what actually works now; falling back to the legacy
// var keeps this working on older projects that haven't migrated keys yet.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

function resolveKey(newKeysEnvVar: string, legacyEnvVar: string): string {
  const raw = Deno.env.get(newKeysEnvVar);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return parsed.default as string;
    } catch {
      // Not JSON (or missing 'default') — fall through to the legacy var.
    }
  }
  return Deno.env.get(legacyEnvVar)!;
}

const SERVICE_ROLE_KEY = resolveKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = resolveKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// 14 random bytes mapped onto an unambiguous alphabet (no 0/O/1/l/I) —
// comfortably strong for a credential that's changed on first use, and
// still easy to read aloud or retype if it has to be relayed by phone/SMS.
function randomTempPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = typeof body?.role === 'string' ? body.role : 'STAFF';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!email) return json({ error: 'Email is required' }, 400);

  // Caller-scoped client — reuses create_organization_invite's own
  // "must be ADMIN" + "resolve the caller's own org" checks rather than
  // duplicating that logic (and its risk of drifting out of sync) here.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: inviteRows, error: inviteErr } = await callerClient.rpc('create_organization_invite', {
    p_email: email,
    p_role: role,
  });
  if (inviteErr) return json({ error: inviteErr.message }, 400);
  const invite = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows;
  if (!invite) return json({ error: 'Invite creation did not return a result' }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: inviteRow, error: inviteRowErr } = await admin
    .from('organization_invites')
    .select('org_id, organizations(name)')
    .eq('id', invite.id)
    .single();
  if (inviteRowErr || !inviteRow) {
    return json({ error: "Could not resolve the new invite's organization" }, 500);
  }
  const orgId = (inviteRow as any).org_id as string;
  const orgName = (inviteRow as any).organizations?.name as string | undefined;

  const tempPassword = randomTempPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { invited_role: invite.role },
  });
  if (createErr || !created?.user) {
    const alreadyExists = /already.*(registered|exists)/i.test(createErr?.message || '');
    return json(
      {
        error: alreadyExists
          ? "This email already has an account. Ask them to sign in normally, or use 'Forgot password' on the sign-in page to reset it."
          : createErr?.message || 'Could not create the account',
      },
      400,
    );
  }

  const { error: profileErr } = await admin.from('users').insert({
    id: created.user.id,
    name: name || email.split('@')[0],
    email,
    role: invite.role,
    must_change_password: true,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: profileErr.message }, 500);
  }

  const { error: memberErr } = await admin.from('user_organization_memberships').insert({
    user_id: created.user.id,
    org_id: orgId,
  });
  if (memberErr) {
    await admin.from('users').delete().eq('id', created.user.id);
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: memberErr.message }, 500);
  }

  await admin.from('organization_invites').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id);

  return json({ email, role: invite.role, tempPassword, orgName });
});
