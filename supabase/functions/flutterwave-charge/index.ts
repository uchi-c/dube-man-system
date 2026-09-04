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
// HONEST CAVEAT: built against best-effort research into Flutterwave's v4
// API (OAuth2 client-credentials + the "direct-charges" orchestration
// endpoint), not a fetched copy of Flutterwave's own docs -- this sandbox
// cannot reach developer.flutterwave.com to verify field names/shapes
// directly. The OAuth token flow (endpoint, form-urlencoded body, `data.
// access_token`/`data.expires_in` response) is corroborated by multiple
// independent sources and should be solid. The charge request body shape
// below (customer/payment_method nesting) is the best available approximation
// and MAY need correcting against a real sandbox call -- if Flutterwave
// rejects the payload, check the error message this function returns
// verbatim, compare against your Flutterwave dashboard's own API
// reference, and adjust buildChargeBody() below accordingly.
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

function buildChargeBody(params: {
  reference: string;
  amount: number;
  currency: string;
  phoneNumber: string;
  network: string;
  customerName: string;
  customerEmail: string;
}) {
  return {
    amount: params.amount,
    currency: params.currency,
    reference: params.reference,
    customer: {
      email: params.customerEmail,
      name: params.customerName,
      phone: params.phoneNumber,
    },
    payment_method: {
      type: 'mobile_money',
      mobile_money: {
        // Flutterwave's v4 mobile_money object wants the phone dialing
        // code ("260" for Zambia), not an ISO country code ("ZM") -- the
        // first real Flutterwave response we got back ("Malformed
        // request", REQUEST_NOT_VALID) came from getting this wrong AND
        // from network being silently omitted below (it's now required,
        // not optional -- see the caller in Deno.serve()).
        country_code: '260',
        network: params.network,
        phone_number: params.phoneNumber,
      },
    },
  };
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

  const reference = `sale-${sale_id}-${Date.now()}`;

  try {
    const token = await getAccessToken();
    const chargeBody = buildChargeBody({
      reference,
      amount: Number(sale.total_amount),
      currency,
      phoneNumber: phone_number,
      network: normalizedNetwork,
      customerName,
      customerEmail,
    });

    const res = await fetch(`${API_BASE_URL}/orchestration/direct-charges`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Trace-Id': crypto.randomUUID(),
        'X-Idempotency-Key': reference,
      },
      body: JSON.stringify(chargeBody),
    });
    const flwBody = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Logged server-side with the exact request body sent, not just the
      // response -- if Flutterwave still rejects this, the fastest way to
      // fix it is comparing what we sent against a real Flutterwave
      // dashboard example, not guessing again.
      console.error('Flutterwave charge rejected:', res.status, 'sent:', JSON.stringify(chargeBody), 'received:', JSON.stringify(flwBody));
      return json({ error: `Flutterwave declined the charge (${res.status}): ${JSON.stringify(flwBody)}` }, 502);
    }

    const { error: updateErr } = await caller
      .from('sales')
      .update({ flw_tx_ref: reference, flw_charge_status: 'pending', flw_initiated_at: new Date().toISOString() })
      .eq('id', sale_id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ status: 'pending', reference, flutterwave: flwBody?.data ?? flwBody });
  } catch (e) {
    console.error('flutterwave-charge failed:', e instanceof Error ? (e.stack ?? e.message) : String(e));
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
