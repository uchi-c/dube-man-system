// supabase/functions/ai-chat/index.ts
//
// In-app AI chatbot. Two audiences, two tool sets:
//   - tenant users (ADMIN/STAFF/CAFE_OPERATOR of an org) get read-only
//     tools scoped to their own shop: sales summary, low-stock items,
//     outstanding customer debts.
//   - platform admins get read-only cross-tenant tools instead: tenant
//     billing list, platform financials, last-active-per-tenant.
// Never both at once, and never service-role: every query runs through
// the caller's own forwarded JWT, so RLS/the RPCs' own is_platform_admin()
// checks are the actual security boundary -- the tool split below is just
// UX (don't hand the model tools that would just fail), not the
// authorization mechanism itself. A bug here can't leak another tenant's
// data because Postgres would refuse the query regardless.
//
// Model: minimax/minimax-m3-free via the Vercel AI SDK's model-string
// routing (Vercel AI Gateway) -- same choice as the WhatsApp bot scaffold
// (supabase/functions/whatsapp-bot). Needs AI_GATEWAY_API_KEY set as a
// Supabase Edge Function secret.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { generateText, tool, stepCountIs } from 'npm:ai@5';
import { z } from 'npm:zod@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '';
const MODEL = 'minimax/minimax-m3-free';

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

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Caller = ReturnType<typeof createClient>;

function tenantTools(caller: Caller) {
  return {
    get_sales_summary: tool({
      description: "This shop's total sales for today and for the last 7 days, broken down by payment method.",
      inputSchema: z.object({}),
      execute: async () => {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await caller
          .from('sales')
          .select('total_amount, payment_method, created_at')
          .gte('created_at', since);
        if (error) return { error: error.message };

        const todayStr = new Date().toISOString().slice(0, 10);
        const rows = (data ?? []) as { total_amount: number; payment_method: string; created_at: string }[];
        const today = rows.filter(r => r.created_at.slice(0, 10) === todayStr);
        const sum = (rs: typeof rows) => rs.reduce((n, r) => n + Number(r.total_amount), 0);
        const byMethod = (rs: typeof rows) =>
          Object.entries(
            rs.reduce<Record<string, number>>((acc, r) => {
              acc[r.payment_method] = (acc[r.payment_method] ?? 0) + Number(r.total_amount);
              return acc;
            }, {})
          ).map(([payment_method, total]) => ({ payment_method, total }));

        return {
          today_total: sum(today),
          today_by_method: byMethod(today),
          last_7_days_total: sum(rows),
          last_7_days_by_method: byMethod(rows),
        };
      },
    }),
    get_low_stock_items: tool({
      description: 'Products at or below their reorder threshold right now.',
      inputSchema: z.object({}),
      execute: async () => {
        // PostgREST filters compare a column to a literal, not to another
        // column of the same row -- there's no "quantity <= min_stock_level"
        // filter to push down, so fetch and compare here instead. Product
        // catalogs are small (tens of rows), so this is cheap.
        const { data, error } = await caller.from('products').select('name, category, quantity, min_stock_level');
        if (error) return { error: error.message };
        const items = ((data ?? []) as { name: string; category: string; quantity: number; min_stock_level: number }[])
          .filter(p => p.quantity <= p.min_stock_level);
        return { items };
      },
    }),
    get_outstanding_debts: tool({
      description: 'Customers with unpaid or partially-paid Credit sales, and how much each owes.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await caller.rpc('list_outstanding_debts');
        if (error) return { error: error.message };
        return { debts: data ?? [] };
      },
    }),
  };
}

function platformAdminTools(caller: Caller) {
  return {
    list_tenants: tool({
      description: 'Every tenant on the platform: billing status, plan price, currency, last payment, modules enabled.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await caller.rpc('list_tenants_billing');
        if (error) return { error: error.message };
        return { tenants: data ?? [] };
      },
    }),
    get_platform_financials: tool({
      description: 'Cross-tenant MRR, outstanding balances, and collected revenue, one row per billing currency.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await caller.rpc('get_platform_financial_summary');
        if (error) return { error: error.message };
        return { summary: data ?? [] };
      },
    }),
    get_tenant_last_active: tool({
      description: 'Last-active timestamp per tenant organization -- useful for spotting churn risk (long-idle tenants).',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await caller.rpc('get_tenant_last_active');
        if (error) return { error: error.message };
        return { last_active: data ?? [] };
      },
    }),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: '"messages" (non-empty array) is required' }, 400);
  }

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const { data: profile } = await caller.from('users').select('is_platform_admin, name').eq('id', user.id).maybeSingle();
  const isPlatformAdmin = !!profile?.is_platform_admin;

  const tools = isPlatformAdmin ? platformAdminTools(caller) : tenantTools(caller);

  const systemPrompt = isPlatformAdmin
    ? `You are the Uruu OS platform admin assistant, talking to ${profile?.name ?? 'the platform admin'}. Uruu OS is a multi-tenant SaaS for Zambian pharmacies, shops, cafés, and printing businesses. You can see cross-tenant billing, revenue, and activity via your tools -- use them to answer with real numbers instead of guessing. Keep answers short and practical. Never invent tenant data you haven't fetched.`
    : `You are Uruu OS's assistant for this business. Help the owner or staff understand their sales, stock, and customer debts using the tools available -- use them to answer with real numbers instead of guessing. Keep answers short, practical, and in plain language for a small-business owner. Never invent figures you haven't fetched.`;

  try {
    const result = await generateText({
      model: MODEL,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(5),
    });
    return json({ reply: result.text });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
