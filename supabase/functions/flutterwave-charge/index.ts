// supabase/functions/flutterwave-charge/index.ts
//
// Sends a real mobile-money push-payment request to a customer's phone via
// Flutterwave's v4 API, for a sale already recorded with
// payment_method = 'Mobile Money'. Does NOT change that sale's
// payment_status/amount_paid -- see migration 035's header comment for why:
// a 'Mobile Money' sale already means "the cashier is recording the
// customer paid," same trust-based semantics as Cash/Bank. flw_charge_status
// on the sale is separate metadata -- whether the actual push-request
// succeeded, is pending the customer's approval, or failed -- for
// reconciliation, not a gate on the ledger.
//
// ============================================================================
// Built against Flutterwave's own v4 "Mobile Money" doc (General Flow),
// pasted in directly -- not the orchestrator's single-call "direct-charges"
// endpoint this function used before, which was guessed (best-effort, no
// docs access) and never worked: every real charge attempt against it came
// back "REQUEST_NOT_VALID (10400): Malformed request" with an empty
// validation_errors array, meaning the request never matched *any* schema
// Flutterwave recognized -- not just a wrong field. The General Flow below
// is the one Flutterwave's docs actually specify field-by-field: three
// calls (create customer -> create payment method -> create charge), each
// with a real documented request/response shape.
//
// Two more real bugs found from live charge attempts against this rewrite
// (see normalizeLocalPhoneNumber() and the reference comment below for
// each fix): phone numbers typed with a "+260"/"260" prefix or spaces
// weren't normalized to Flutterwave's expected bare local number, and the
// charge `reference` (sale UUID + timestamp) exceeded Flutterwave's
// 42-character limit.
// ============================================================================
//
// Required Supabase Edge Function secrets:
//   FLUTTERWAVE_CLIENT_ID, FLUTTERWAVE_CLIENT_SECRET
//   FLUTTERWAVE_ENVIRONMENT = 'sandbox' | 'production' (defaults to
//     'sandbox' -- deliberately safe-by-default until proven against a
//     real sandbox charge; only set to 'production' once that's done)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '';
const CLIENT_ID = Deno.env.get('FLUTTERWAVE_CLIENT_ID');
const CLIENT_SECRET = Deno.env.get('FLUTTERWAVE_CLIENT_SECRET');
const ENVIRONMENT = Deno.env.get('FLUTTERWAVE_ENVIRONMENT') === 'production' ? 'production' : 'sandbox';

const TOKEN_URL = 'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token';
const API_BASE_URL = ENVIRONMENT === 'production'
  ? 'https://api.flutterwave.com'
  : 'https://developersandbox-api.flutterwave.com';

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

// Cached across warm invocations of this function instance -- avoids a
// token round-trip on every charge. Cleared/refetched once within 60s of
// expiry.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('FLUTTERWAVE_CLIENT_ID/FLUTTERWAVE_CLIENT_SECRET are not set');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Flutterwave auth failed (${res.status}): ${JSON.stringify(body)}`);

  const accessToken = body?.data?.access_token ?? body?.access_token;
  const expiresIn = Number(body?.data?.expires_in ?? body?.expires_in ?? 600);
  if (!accessToken) throw new Error(`Flutterwave auth response had no access_token: ${JSON.stringify(body)}`);

  cachedToken = { value: accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  return accessToken;
}

// Flutterwave's mobile_money.phone_number pairs with country_code and
// expects the bare local subscriber number: no leading "0" (docs example:
// country_code "233" + number "9012345678", not "09012345678"), and no
// spaces/dashes/"+"/repeated country code. A real charge attempt with the
// old strip-leading-zero-only version got "phone.number must be a valid 7
// to 10 digit phone number" -- almost certainly because a cashier can type
// a number as "+260977123456" or "260 977 123456" just as easily as
// "0977123456", and only the last of those was ever handled. This strips
// everything but digits, then drops a leading country code if the cashier
// included it, then drops a leading local "0".
function normalizeLocalPhoneNumber(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('260')) digits = digits.slice(3);
  return digits.replace(/^0+/, '');
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: 'Customer', last: 'Customer' };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

class FlutterwaveApiError extends Error {
  constructor(public step: string, public status: number, public sent: unknown, public body: unknown) {
    super(`Flutterwave ${step} failed (${status}): ${JSON.stringify(body)}`);
  }
}

async function flutterwavePost(token: string, path: string, body: unknown, step: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Trace-Id': crypto.randomUUID(),
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const responseBody = await res.json().catch(() => ({}));
  if (!res.ok) throw new FlutterwaveApiError(step, res.status, body, responseBody);
  return responseBody?.data ?? responseBody;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  let body: { sale_id?: string; phone_number?: string; network?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { sale_id, phone_number, network } = body;
  if (!sale_id || !phone_number) return json({ error: 'sale_id and phone_number are required' }, 400);
  const VALID_NETWORKS = new Set(['MTN', 'AIRTEL', 'ZAMTEL']);
  const normalizedNetwork = (network ?? '').toUpperCase();
  if (!VALID_NETWORKS.has(normalizedNetwork)) {
    return json({ error: 'network is required and must be one of MTN, AIRTEL, ZAMTEL' }, 400);
  }

  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });

  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) return json({ error: 'Not authenticated' }, 401);

  // RLS-scoped: this simply returns nothing if the sale isn't in one of the
  // caller's own organizations -- no separate ownership check needed.
  const { data: sale, error: saleErr } = await caller
    .from('sales')
    .select('id, total_amount, payment_method, organization_id, flw_charge_status, customer_id')
    .eq('id', sale_id)
    .maybeSingle();
  if (saleErr) return json({ error: saleErr.message }, 500);
  if (!sale) return json({ error: 'Sale not found (or not in your organization)' }, 404);
  if (sale.payment_method !== 'Mobile Money') {
    return json({ error: "Only sales recorded with payment_method 'Mobile Money' can be push-charged" }, 400);
  }
  if (sale.flw_charge_status === 'pending') {
    return json({ error: 'A push-charge is already pending for this sale' }, 409);
  }

  const { data: org } = await caller.from('organizations').select('currency, name').eq('id', sale.organization_id).maybeSingle();
  const currency = org?.currency || 'ZMW';

  let customerName = 'Customer';
  let customerEmail = user.email ?? 'no-reply@uruu.enterprises';
  if (sale.customer_id) {
    const { data: customer } = await caller.from('customers').select('name, email').eq('id', sale.customer_id).maybeSingle();
    if (customer?.name) customerName = customer.name;
    if (customer?.email) customerEmail = customer.email;
  }

  // Flutterwave rejects references over 42 chars -- a real attempt with
  // "sale-<uuid>-<ms timestamp>" (~55 chars) came back "reference: size
  // must be between 6 and 42". The first 8 hex chars of the sale's own
  // UUID plus a base36 timestamp is short (under 20 chars), unique enough
  // for this purpose, and still traceable back to the sale by eye.
  const reference = `sale-${sale_id.slice(0, 8)}-${Date.now().toString(36)}`;
  const localPhoneNumber = normalizeLocalPhoneNumber(phone_number);
  const { first, last } = splitName(customerName);

  try {
    const token = await getAccessToken();

    const customer = await flutterwavePost(
      token,
      '/customers',
      {
        email: customerEmail,
        name: { first, last },
        phone: { country_code: '260', number: localPhoneNumber },
      },
      'create customer',
    );

    const paymentMethod = await flutterwavePost(
      token,
      '/payment-methods',
      {
        type: 'mobile_money',
        mobile_money: {
          country_code: '260',
          network: normalizedNetwork,
          phone_number: localPhoneNumber,
        },
      },
      'create payment method',
    );

    const charge = await flutterwavePost(
      token,
      '/charges',
      {
        currency,
        customer_id: customer.id,
        payment_method_id: paymentMethod.id,
        amount: Number(sale.total_amount),
        reference,
      },
      'create charge',
    );

    const { error: updateErr } = await caller
      .from('sales')
      .update({ flw_tx_ref: reference, flw_charge_status: 'pending', flw_initiated_at: new Date().toISOString() })
      .eq('id', sale_id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ status: 'pending', reference, flutterwave: charge });
  } catch (e) {
    if (e instanceof FlutterwaveApiError) {
      // Logged server-side with which step failed, exactly what we sent,
      // and exactly what Flutterwave rejected -- the fastest way to
      // diagnose a future schema mismatch is comparing sent vs. received
      // against Flutterwave's own docs, not guessing again.
      console.error(`Flutterwave charge rejected at "${e.step}":`, e.status, 'sent:', JSON.stringify(e.sent), 'received:', JSON.stringify(e.body));
      return json({ error: `Flutterwave declined the charge (${e.step}, ${e.status}): ${JSON.stringify(e.body)}` }, 502);
    }
    console.error('flutterwave-charge failed:', e instanceof Error ? (e.stack ?? e.message) : String(e));
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
