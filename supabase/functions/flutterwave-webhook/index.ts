// supabase/functions/flutterwave-webhook/index.ts
//
// Receives Flutterwave's async webhook once a customer approves (or the
// charge fails/expires) after flutterwave-charge sent a push-request.
// Updates only sales.flw_charge_status/flw_transaction_id -- never
// payment_status/amount_paid, see migration 035's header comment for why.
//
// ============================================================================
// HONEST CAVEAT: same as flutterwave-charge -- built against best-effort
// research, not a fetched copy of Flutterwave's docs. What's corroborated:
// v4 signs webhooks with HMAC-SHA256 of the payload using a "secret hash"
// you set in the Flutterwave dashboard's webhook settings (a DIFFERENT
// value from the Client ID/Secret/Encryption Key already in Supabase
// secrets), returned in a `flutterwave-signature` header. The exact event/
// payload field names (event name, where the reference and status live)
// are this function's best guess -- extractEventInfo() below tries a few
// plausible shapes and is the first place to fix if a real webhook doesn't
// match.
// ============================================================================
//
// Required Supabase Edge Function secret (separate from the charge
// function's credentials): FLUTTERWAVE_WEBHOOK_SECRET_HASH -- set this to
// whatever secret hash you configure in Flutterwave's dashboard under
// Settings -> Webhooks when you register this function's URL there.
//
// verify_jwt is off for this function (Flutterwave doesn't send a Supabase
// JWT) -- the signature check below is the real authentication.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
function resolveServiceRoleKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return parsed.default as string;
    } catch {
      // Not JSON — fall through to the legacy var.
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}
const SERVICE_ROLE_KEY = resolveServiceRoleKey();
const WEBHOOK_SECRET_HASH = Deno.env.get('FLUTTERWAVE_WEBHOOK_SECRET_HASH');

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type EventInfo = { reference: string | null; status: 'successful' | 'failed' | 'pending' | null; transactionId: string | null };

function extractEventInfo(payload: any): EventInfo {
  const data = payload?.data ?? payload;
  const reference: string | null = data?.reference ?? data?.tx_ref ?? data?.txRef ?? null;
  const transactionId: string | null = data?.id != null ? String(data.id) : data?.transaction_id ?? null;

  const rawStatus: string = (data?.status ?? '').toString().toLowerCase();
  let status: EventInfo['status'] = null;
  if (['successful', 'completed', 'success'].includes(rawStatus)) status = 'successful';
  else if (['failed', 'cancelled', 'declined'].includes(rawStatus)) status = 'failed';
  else if (rawStatus) status = 'pending';

  return { reference, status, transactionId };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const rawBody = await req.text();
  const signature = req.headers.get('flutterwave-signature') ?? req.headers.get('verif-hash');

  if (!WEBHOOK_SECRET_HASH) {
    // Can't verify without it -- refuse rather than trust an unverifiable payload.
    return json({ error: 'FLUTTERWAVE_WEBHOOK_SECRET_HASH is not set' }, 500);
  }
  if (!signature) return json({ error: 'Missing signature header' }, 401);

  const expected = await hmacSha256Hex(WEBHOOK_SECRET_HASH, rawBody);
  if (!timingSafeEqual(signature, expected)) {
    return json({ error: 'Signature mismatch' }, 401);
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { reference, status, transactionId } = extractEventInfo(payload);
  if (!reference || !status) {
    // Recognized signature but a payload shape we don't understand yet —
    // acknowledge so Flutterwave doesn't retry-storm, but flag it clearly.
    return json({ received: true, warning: 'Could not extract reference/status from payload — see extractEventInfo()' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await admin
    .from('sales')
    .update({ flw_charge_status: status, flw_transaction_id: transactionId })
    .eq('flw_tx_ref', reference);

  if (error) return json({ error: error.message }, 500);
  return json({ received: true });
});
