// supabase/functions/send-billing-emails/index.ts
//
// Invoked hourly by pg_cron (see migration 024's cron.schedule) via pg_net.
// Pulls every pending billing email from get_pending_billing_emails() --
// trial due within 3 days, access locked, or a payment just recorded, the
// same three moments BillingNotificationBanner.tsx shows in-app -- sends
// each through Resend, then marks it sent via mark_billing_email_sent() so
// the next hourly tick doesn't repeat it.
//
// Both RPCs are service_role-only (see migration 024), so this always uses
// the service-role client, never a caller-scoped one -- there is no
// end-user caller here, only the cron job.
//
// RESEND_API_KEY must be set as a Supabase Edge Function secret (Dashboard
// -> Edge Functions -> Secrets) -- never hold that key in code or in this
// repo. BILLING_EMAIL_FROM is optional; it must be an address on a domain
// verified in Resend, or Resend will reject the send.
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
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_ADDRESS = Deno.env.get('BILLING_EMAIL_FROM') || 'Uruu OS <billing@uruu.enterprises>';

function money(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

type PendingRow = {
  kind: 'trial_due_soon' | 'locked' | 'payment_confirmation';
  org_id: string;
  org_name: string;
  email: string | null;
  currency: string | null;
  amount: number | null;
  due_date: string | null;
  payment_id: string | null;
};

function buildEmail(row: PendingRow): { subject: string; html: string } | null {
  if (row.kind === 'trial_due_soon' && row.due_date) {
    const daysLeft = Math.max(0, Math.round((new Date(row.due_date).getTime() - Date.now()) / 86400000));
    return {
      subject: `${row.org_name}: your Uruu OS trial ends ${daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}`,
      html: `<p>Hi,</p><p>The free trial for <strong>${row.org_name}</strong> on Uruu OS ends on <strong>${row.due_date}</strong>${daysLeft > 0 ? ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)` : ''}.</p><p>Make a payment before then to keep access without interruption.</p><p>&mdash; Uruu OS</p>`,
    };
  }
  if (row.kind === 'locked') {
    return {
      subject: `${row.org_name}: access paused on Uruu OS`,
      html: `<p>Hi,</p><p><strong>${row.org_name}</strong>'s access to Uruu OS has been paused because of a missed payment.</p><p>Make a payment to restore access.</p><p>&mdash; Uruu OS</p>`,
    };
  }
  if (row.kind === 'payment_confirmation' && row.amount != null && row.currency) {
    return {
      subject: `${row.org_name}: payment received`,
      html: `<p>Hi,</p><p>We've received a payment of <strong>${money(row.amount, row.currency)}</strong> for <strong>${row.org_name}</strong> on Uruu OS. Thank you!</p><p>&mdash; Uruu OS</p>`,
    };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not set' }), { status: 500 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: rows, error } = await admin.rpc('get_pending_billing_emails');
  if (error) {
    console.error('send-billing-emails: get_pending_billing_emails failed:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const row of (rows ?? []) as PendingRow[]) {
    if (!row.email) continue;
    const email = buildEmail(row);
    if (!email) continue;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [row.email],
          subject: email.subject,
          html: email.html,
        }),
      });

      if (!res.ok) {
        const msg = `${row.kind}/${row.org_id}: Resend ${res.status} ${await res.text()}`;
        console.error('send-billing-emails row failed:', msg);
        errors.push(msg);
        continue;
      }

      const { error: markErr } = await admin.rpc('mark_billing_email_sent', {
        p_kind: row.kind,
        p_org_id: row.org_id,
        p_payment_id: row.payment_id,
      });
      if (markErr) {
        errors.push(`${row.kind}/${row.org_id}: sent but failed to mark (${markErr.message})`);
        continue;
      }

      sent += 1;
    } catch (e) {
      const msg = `${row.kind}/${row.org_id}: ${e instanceof Error ? e.message : String(e)}`;
      // This runs on an hourly cron tick with nobody reading the response
      // body -- console.error is the only way a per-row failure is ever
      // actually seen.
      console.error('send-billing-emails row failed:', msg);
      errors.push(msg);
    }
  }

  return new Response(JSON.stringify({ sent, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
