// supabase/functions/admin-invite-platform-admin/index.ts
//
// Platform-admin-only: creates a brand-new Supabase Auth account for
// someone who doesn't already have an Uruu OS login and grants them
// is_platform_admin immediately -- e.g. bringing on a co-founder or
// engineer to help run the platform. For someone who already HAS an
// account, the frontend calls find_user_by_email + set_platform_admin
// directly (both plain RPCs, no service-role needed) instead of this
// function -- this one exists only because creating a password-based
// Auth account requires Supabase Auth's admin API.
//
// Mirrors admin-invite-user/admin-create-tenant's shape: caller-scoped
// check first (is_platform_admin(), not reimplemented here), then a
// service-role client only for the parts that actually need it.
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
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!email) return json({ error: 'Email is required' }, 400);

  try {
    // Caller-scoped: only ever proceeds if the caller is themselves a
    // platform admin — this RPC is the single source of truth for that,
    // never re-decided here.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isAdmin, error: authCheckErr } = await callerClient.rpc('is_platform_admin');
    if (authCheckErr) return json({ error: authCheckErr.message }, 400);
    if (!isAdmin) return json({ error: 'Only a platform admin can add another platform admin' }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const tempPassword = randomTempPassword();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { invited_as: 'platform_admin' },
    });
    if (createErr || !created?.user) {
      const alreadyExists = /already.*(registered|exists)/i.test(createErr?.message || '');
      return json(
        {
          error: alreadyExists
            ? 'This email already has an account. Use "Promote existing user" instead.'
            : createErr?.message || 'Could not create the account',
        },
        400,
      );
    }

    const { error: profileErr } = await admin.from('users').insert({
      id: created.user.id,
      name: name || email.split('@')[0],
      email,
      role: 'ADMIN',
      is_platform_admin: true,
      must_change_password: true,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: profileErr.message }, 500);
    }

    return json({ email, tempPassword });
  } catch (e) {
    console.error('admin-invite-platform-admin failed:', e instanceof Error ? (e.stack ?? e.message) : String(e));
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
