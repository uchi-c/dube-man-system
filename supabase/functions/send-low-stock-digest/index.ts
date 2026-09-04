// supabase/functions/send-low-stock-digest/index.ts
//
// Invoked once daily by pg_cron (see migration 029's cron.schedule) via
// pg_net. Pulls every org that currently has at least one low-stock
// product and hasn't been emailed today from get_pending_low_stock_digests(),
// sends each an itemized digest through Resend, then marks it sent via
// mark_low_stock_digest_sent() so later ticks the same day don't repeat it.
//
// Both RPCs are service_role-only (see migration 029), so this always uses
// the service-role client, never a caller-scoped one -- there is no
// end-user caller here, only the cron job. Same shape as
// send-billing-emails, this feature's closest sibling.
//
// RESEND_API_KEY must be set as a Supabase Edge Function secret (Dashboard
// -> Edge Functions -> Secrets) -- never hold that key in code or in this
// repo. LOW_STOCK_EMAIL_FROM is optional; it must be an address on a
// domain verified in Resend, or Resend will reject the send.
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
const FROM_ADDRESS = Deno.env.get('LOW_STOCK_EMAIL_FROM') || 'Uruu OS <billing@uruu.enterprises>';

type LowStockItem = { name: string; quantity: number; min_stock_level: number; category: string };

type PendingRow = {
  org_id: string;
  org_name: string;
  email: string | null;
  items: LowStockItem[];
};

function buildEmail(row: PendingRow): { subject: string; html: string } {
  const rows = row.items
    .map(
      (item) =>
        `<tr><td style="padding:4px 10px 4px 0;">${item.name}</td><td style="padding:4px 10px;color:#666;">${item.category}</td><td style="padding:4px 0 4px 10px;text-align:right;font-weight:600;">${item.quantity} left (min ${item.min_stock_level})</td></tr>`
    )
    .join('');

  return {
    subject: `${row.org_name}: ${row.items.length} item${row.items.length === 1 ? '' : 's'} running low`,
    html: `<p>Hi,</p><p>The following item${row.items.length === 1 ? ' is' : 's are'} at or below its reorder threshold in <strong>${row.org_name}</strong> on Uruu OS:</p><table style="border-collapse:collapse;">${rows}</table><p>Restock soon to avoid running out.</p><p>&mdash; Uruu OS</p>`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not set' }), { status: 500 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: rows, error } = await admin.rpc('get_pending_low_stock_digests');
  if (error) {
    console.error('send-low-stock-digest: get_pending_low_stock_digests failed:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const row of (rows ?? []) as PendingRow[]) {
    if (!row.email || !row.items?.length) continue;
    const email = buildEmail(row);

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
        const msg = `${row.org_id}: Resend ${res.status} ${await res.text()}`;
        console.error('send-low-stock-digest row failed:', msg);
        errors.push(msg);
        continue;
      }

      const { error: markErr } = await admin.rpc('mark_low_stock_digest_sent', { p_org_id: row.org_id });
      if (markErr) {
        errors.push(`${row.org_id}: sent but failed to mark (${markErr.message})`);
        continue;
      }

      sent += 1;
    } catch (e) {
      const msg = `${row.org_id}: ${e instanceof Error ? e.message : String(e)}`;
      console.error('send-low-stock-digest row failed:', msg);
      errors.push(msg);
    }
  }

  return new Response(JSON.stringify({ sent, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
