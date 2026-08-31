// supabase/functions/admin-create-tenant/index.ts
//
// Platform-admin-only: creates a brand-new tenant (organization) plus its
// owner's Auth account, in one call. Mirrors admin-invite-user's split:
// the org itself is created by a caller-scoped RPC (create_tenant_org),
// which enforces "caller must be a platform admin" the same way
// admin-invite-user delegates its own authorization to
// create_organization_invite -- this function only ever acts on whatever
// org_id that RPC returned, never one supplied by the client directly.
//
// The owner's account needs Supabase Auth's admin API (a password-based
// account can't be created by a plain RPC), which needs a service-role
// key -- see admin-invite-user's header comment for why SUPABASE_SECRET_KEYS
// is resolved in preference to the legacy SUPABASE_SERVICE_ROLE_KEY.
//
// If owner-account creation fails after the org was already created, the
// org is deleted so the platform admin can just retry the whole form
// cleanly, rather than being left with an org that has no owner and no
// obvious way to add one (the platform admin isn't a member of the new
// org, so admin-invite-user's normal "invite a teammate" path can't reach
// it either).
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

// Same alphabet/shape as admin-invite-user's temp password — comfortably
// strong for a credential that's changed on first use.
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

  const orgName = typeof body?.orgName === 'string' ? body.orgName.trim() : '';
  const businessType = typeof body?.businessType === 'string' ? body.businessType : 'general';
  const monthlyPrice = body?.monthlyPrice === null || body?.monthlyPrice === undefined ? null : Number(body.monthlyPrice);
  const currency = typeof body?.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'USD';
  const paymentMethod = typeof body?.paymentMethod === 'string' ? body.paymentMethod.trim() : '';
  const billingCycle = typeof body?.billingCycle === 'string' && body.billingCycle.trim() ? body.billingCycle.trim() : 'monthly';
  const ownerEmail = typeof body?.ownerEmail === 'string' ? body.ownerEmail.trim().toLowerCase() : '';
  const ownerName = typeof body?.ownerName === 'string' ? body.ownerName.trim() : '';

  if (!orgName) return json({ error: 'Tenant name is required' }, 400);
  if (!ownerEmail) return json({ error: "Owner's email is required" }, 400);
  if (monthlyPrice !== null && (!Number.isFinite(monthlyPrice) || monthlyPrice < 0)) {
    return json({ error: 'Monthly price must be a non-negative number' }, 400);
  }

  // Caller-scoped client — create_tenant_org enforces "must be a platform
  // admin" itself; this function never decides authorization on its own.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: orgId, error: orgErr } = await callerClient.rpc('create_tenant_org', {
    p_name: orgName,
    p_business_type: businessType,
    p_monthly_price: monthlyPrice,
    p_currency: currency,
    p_payment_method: paymentMethod || null,
    p_billing_cycle: billingCycle,
  });
  if (orgErr) return json({ error: orgErr.message }, 400);
  if (!orgId) return json({ error: 'Tenant creation did not return an id' }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const tempPassword = randomTempPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { invited_role: 'ADMIN' },
  });
  if (createErr || !created?.user) {
    await admin.from('organizations').delete().eq('id', orgId);
    const alreadyExists = /already.*(registered|exists)/i.test(createErr?.message || '');
    return json(
      {
        error: alreadyExists
          ? "This email already has an account. Use a different owner email, or add them to an existing tenant from Team instead."
          : createErr?.message || "Could not create the owner's account",
      },
      400,
    );
  }

  const { error: profileErr } = await admin.from('users').insert({
    id: created.user.id,
    name: ownerName || ownerEmail.split('@')[0],
    email: ownerEmail,
    role: 'ADMIN',
    must_change_password: true,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from('organizations').delete().eq('id', orgId);
    return json({ error: profileErr.message }, 500);
  }

  const { error: memberErr } = await admin.from('user_organization_memberships').insert({
    user_id: created.user.id,
    org_id: orgId,
  });
  if (memberErr) {
    await admin.from('users').delete().eq('id', created.user.id);
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from('organizations').delete().eq('id', orgId);
    return json({ error: memberErr.message }, 500);
  }

  return json({ organizationId: orgId, orgName, email: ownerEmail, tempPassword });
});
