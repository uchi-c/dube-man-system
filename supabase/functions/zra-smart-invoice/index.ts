// supabase/functions/zra-smart-invoice/index.ts
//
// ZRA Smart Invoice (VSDC) integration -- scaffold. Two actions:
//   { action: "init" }                    -> device initialization
//   { action: "submit-sale", saleId }     -> fiscalise one sale (saveSales)
//
// Caller-scoped throughout (never service-role): every read/write goes
// through the caller's own JWT, so RLS on smart_invoice_settings/sales/
// products (org admins only, own org -- see migration 025) is the single
// source of truth for who can do this. There is no privileged bypass here.
//
// Endpoint paths and field names (tpin, bhfId, dvcSrlNo, cisInvcNo,
// itemClsCd, vatCatCd, taxblAmt<cat>, taxAmt<cat>, ...) match ZRA's
// published VSDC API spec. vsdc_base_url is per-organization because ZRA's
// VSDC is a *local* install on the taxpayer's own server -- not a shared
// cloud endpoint -- except ZRA's own shared sandbox
// (https://api-sandbox.zra.org.zm/vsdc-api/v1), which orgs can point at
// while testing before they have a real local VSDC deployed. See
// migration 025's header comment for the fuller explanation.
//
// NOT wired into the POS sale-completion flow: "submit-sale" is only ever
// called explicitly (e.g. a future "Submit to ZRA" button), never
// automatically, until this has been proven against a real sandbox TPIN.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '';

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

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function dateStamp(dateStr: string): string {
  const d = new Date(dateStr);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// ZRA VAT category -> rate (%). Matches the standard published categories;
// an org can still assign any code to a product, this is only used to
// compute the tax split ZRA's saveSales payload requires per category.
const VAT_RATES: Record<string, number> = {
  A: 16, B: 0, C1: 0, C2: 0, C3: 0, D: 0, E: 0,
};

async function initDevice(caller: ReturnType<typeof createClient>) {
  const { data: settings, error: settingsErr } = await caller
    .from('smart_invoice_settings')
    .select('*')
    .maybeSingle();
  if (settingsErr) return json({ error: settingsErr.message }, 400);
  if (!settings) return json({ error: 'Smart Invoice is not configured for this organization yet' }, 400);
  if (!settings.tpin || !settings.device_serial_no || !settings.vsdc_base_url) {
    return json({ error: 'TPIN, device serial number, and VSDC server URL are all required before initializing' }, 400);
  }

  const payload = {
    tpin: settings.tpin,
    bhfId: settings.branch_id || '000',
    dvcSrlNo: settings.device_serial_no,
  };

  let response: Response;
  try {
    response = await fetch(`${settings.vsdc_base_url.replace(/\/$/, '')}/api/v1/InitializationInfo/selectInitInfo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json({ error: `Could not reach VSDC server: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  const data = await response.json().catch(() => null);
  const resultCd = data?.resultCd ?? data?.Result?.resultCd;
  const success = response.ok && (resultCd === '000' || resultCd === '902');

  const { error: updateErr } = await caller
    .from('smart_invoice_settings')
    .update({
      is_initialized: success,
      last_init_result: data ?? { httpStatus: response.status },
      updated_at: new Date().toISOString(),
    })
    .eq('id', settings.id);
  if (updateErr) return json({ error: updateErr.message }, 500);

  return json({ success, resultCd, raw: data });
}

async function submitSale(caller: ReturnType<typeof createClient>, saleId: string) {
  const { data: settings, error: settingsErr } = await caller
    .from('smart_invoice_settings')
    .select('*')
    .maybeSingle();
  if (settingsErr) return json({ error: settingsErr.message }, 400);
  if (!settings || !settings.is_enabled) return json({ error: 'Smart Invoice is not enabled for this organization' }, 400);
  if (!settings.tpin || !settings.vsdc_base_url) return json({ error: 'Smart Invoice settings are incomplete' }, 400);

  const { data: sale, error: saleErr } = await caller
    .from('sales')
    .select('*, customers(name), sale_items(quantity, unit_price, products(name, vat_category_code, item_classification_code))')
    .eq('id', saleId)
    .maybeSingle();
  if (saleErr) return json({ error: saleErr.message }, 400);
  if (!sale) return json({ error: 'Sale not found' }, 404);

  const items = (sale.sale_items ?? []) as Array<{
    quantity: number;
    unit_price: number;
    products: { name: string; vat_category_code: string; item_classification_code: string | null } | null;
  }>;

  const missingClassification = items.find((it) => !it.products?.item_classification_code);
  if (missingClassification) {
    return json({ error: `Product "${missingClassification.products?.name ?? 'unknown'}" has no ZRA item classification code set yet` }, 400);
  }

  const taxTotals: Record<string, { taxbl: number; tax: number }> = {};
  const itemList = items.map((it, idx) => {
    const vatCat = it.products!.vat_category_code || 'A';
    const rate = VAT_RATES[vatCat] ?? 0;
    const splyAmt = Math.round(it.unit_price * it.quantity * 100) / 100;
    const taxAmt = Math.round(splyAmt * (rate / (100 + rate)) * 100) / 100; // VAT-inclusive pricing
    const taxblAmt = Math.round((splyAmt - taxAmt) * 100) / 100;

    taxTotals[vatCat] ??= { taxbl: 0, tax: 0 };
    taxTotals[vatCat].taxbl = Math.round((taxTotals[vatCat].taxbl + taxblAmt) * 100) / 100;
    taxTotals[vatCat].tax = Math.round((taxTotals[vatCat].tax + taxAmt) * 100) / 100;

    return {
      itemSeq: idx + 1,
      itemCd: it.products!.item_classification_code,
      itemClsCd: it.products!.item_classification_code,
      itemNm: it.products!.name,
      qty: it.quantity,
      qtyUnitCd: 'EA',
      prc: it.unit_price,
      splyAmt,
      dcRt: 0,
      dcAmt: 0,
      taxTyCd: vatCat,
      vatCatCd: vatCat,
      taxblAmt,
      taxAmt,
      totAmt: splyAmt,
    };
  });

  const payload: Record<string, unknown> = {
    tpin: settings.tpin,
    bhfId: settings.branch_id || '000',
    cisInvcNo: sale.id,
    custTpin: null,
    custNm: sale.customers?.name || 'Cash Sale',
    salesTyCd: 'N',
    rcptTyCd: 'S',
    pmtTyCd: sale.payment_method?.toLowerCase().includes('cash') ? '01' : '04',
    salesSttsCd: '02',
    cfmDt: nowStamp(),
    salesDt: dateStamp(sale.created_at),
    totItemCnt: itemList.length,
    totTaxblAmt: Math.round(Object.values(taxTotals).reduce((s, t) => s + t.taxbl, 0) * 100) / 100,
    totTaxAmt: Math.round(Object.values(taxTotals).reduce((s, t) => s + t.tax, 0) * 100) / 100,
    totAmt: sale.total_amount,
    remark: '',
    regrId: 'Uruu OS',
    regrNm: 'Uruu OS',
    modrId: 'Uruu OS',
    modrNm: 'Uruu OS',
    saleCtyCd: '1',
    currencyTyCd: 'ZMW',
    exchangeRt: '1',
    prchrAcptcYn: 'N',
    itemList,
  };
  for (const [cat, totals] of Object.entries(taxTotals)) {
    payload[`taxblAmt${cat}`] = totals.taxbl;
    payload[`taxAmt${cat}`] = totals.tax;
  }

  let response: Response;
  try {
    response = await fetch(`${settings.vsdc_base_url!.replace(/\/$/, '')}/api/v1/SalesInformation/saveSales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json({ error: `Could not reach VSDC server: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  const data = await response.json().catch(() => null);
  const result = data?.Result ?? data;
  const resultCd = result?.resultCd;
  const success = response.ok && resultCd === '000';

  const { error: updateErr } = await caller
    .from('sales')
    .update({
      zra_status: success ? 'submitted' : 'failed',
      zra_invoice_number: success ? (result?.rcptNo ?? result?.invcNo ?? null) : null,
      zra_receipt_signature: success ? (result?.intrlData ?? result?.rcptSgnt ?? null) : null,
      zra_submitted_at: success ? new Date().toISOString() : null,
      zra_error: success ? null : (result?.resultMsg ?? `HTTP ${response.status}`),
    })
    .eq('id', saleId);
  if (updateErr) return json({ error: updateErr.message }, 500);

  return json({ success, resultCd, raw: data });
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

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  if (body?.action === 'init') return initDevice(caller);
  if (body?.action === 'submit-sale') {
    if (typeof body.saleId !== 'string') return json({ error: 'saleId is required' }, 400);
    return submitSale(caller, body.saleId);
  }
  return json({ error: 'Unknown action. Use "init" or "submit-sale".' }, 400);
});
