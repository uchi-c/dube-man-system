// supabase/functions/send-platform-announcement/index.ts
//
// Platform-admin-only: emails every tenant owner at once (e.g. "Smart
// Invoice is now available"). Mirrors admin-invite-platform-admin's shape:
// a caller-scoped client verifies the caller is actually a platform admin
// (is_platform_admin(), not reimplemented here) before anything else, then
// a service-role client does the actual work -- fetching recipients
// (list_org_owner_emails(), migration 032, service_role only) and sending
// through Resend.
//
// Sent as one email per org owner (not a single BCC blast) so the greeting
// can name their business. Logs the send via log_platform_announcement_sent
// once all sends have been attempted, so the platform admin audit log has
// a record even if some individual sends failed.
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
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_ADDRESS = Deno.env.get('ANNOUNCEMENT_EMAIL_FROM') || 'Uruu OS <billing@uruu.enterprises>';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY is not set' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!subject) return json({ error: 'Subject is required' }, 400);
  if (!message) return json({ error: 'Message is required' }, 400);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: isAdmin, error: authCheckErr } = await callerClient.rpc('is_platform_admin');
  if (authCheckErr) return json({ error: authCheckErr.message }, 400);
  if (!isAdmin) return json({ error: 'Only a platform admin can send an announcement' }, 403);

  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) return json({ error: 'Could not resolve the calling account' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: recipients, error: recipientsErr } = await admin.rpc('list_org_owner_emails');
  if (recipientsErr) return json({ error: recipientsErr.message }, 500);

  const bodyHtml = message
    .split('\n\n')
    .map((para: string) => `<p>${para.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  let sent = 0;
  const errors: string[] = [];

  for (const row of (recipients ?? []) as { org_id: string; org_name: string; email: string | null }[]) {
    if (!row.email) continue;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [row.email],
          subject,
          html: `<p>Hi,</p>${bodyHtml}<p>&mdash; Uruu OS</p>`,
        }),
      });
      if (!res.ok) {
        const msg = `${row.org_id}: Resend ${res.status} ${await res.text()}`;
        console.error('send-platform-announcement row failed:', msg);
        errors.push(msg);
        continue;
      }
      sent += 1;
    } catch (e) {
      const msg = `${row.org_id}: ${e instanceof Error ? e.message : String(e)}`;
      console.error('send-platform-announcement row failed:', msg);
      errors.push(msg);
    }
  }

  const { error: logErr } = await admin.rpc('log_platform_announcement_sent', {
    p_actor_id: caller.id,
    p_subject: subject,
    p_recipient_count: sent,
  });
  if (logErr) errors.push(`log: ${logErr.message}`);

  return json({ sent, errors }, 200);
});
