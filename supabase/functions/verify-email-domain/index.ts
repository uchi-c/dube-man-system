// supabase/functions/verify-email-domain/index.ts
//
// Catches a typo'd or fake email domain at signup time -- before an auth
// account is even created -- rather than only finding out later when the
// confirmation email silently bounces and the person is stuck with an
// unconfirmable, unusable account. Complements the existing Supabase
// "confirm email" requirement (which verifies the person can click a link
// sent to the address) with a check of whether the domain itself could
// ever receive mail in the first place.
//
// No third-party email-verification API and no new credential needed --
// Deno's built-in Deno.resolveDns() does real MX/A lookups directly.
//
// Callable anonymously (pre-signup, no session yet): verify_jwt stays on
// the default, since supabase-js sends the project's anon key as the
// bearer token even for a signed-out caller, which already satisfies it.
// This only ever returns a yes/no on the domain -- it never creates,
// reads, or touches any account.
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

// A modest, non-exhaustive list of well-known disposable/throwaway email
// providers -- not a substitute for the DNS check below, just an extra
// signal for domains that resolve fine but exist solely to dodge signup
// verification.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', '10minutemail.com',
  'yopmail.com', 'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'trashmail.com',
  'getnada.com', 'dispostable.com', 'sharklasers.com', 'fakeinbox.com', 'mailnesia.com',
  'mintemail.com', 'mytemp.email', 'moakt.com', 'discard.email', 'spamgourmet.com',
]);

async function domainHasMailRoute(domain: string): Promise<boolean> {
  try {
    const mx = await Deno.resolveDns(domain, 'MX');
    if (mx.length > 0) return true;
  } catch {
    // No MX records (or the lookup itself failed) -- fall through and try
    // a plain A record, since some smaller mail setups skip MX entirely.
  }
  try {
    const a = await Deno.resolveDns(domain, 'A');
    return a.length > 0;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const email = (body.email ?? '').trim();
  const match = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(email);
  if (!match) return json({ valid: false, reason: 'malformed' });

  const domain = match[1].toLowerCase();
  if (DISPOSABLE_DOMAINS.has(domain)) return json({ valid: false, reason: 'disposable_domain' });

  const routable = await domainHasMailRoute(domain);
  return json(routable ? { valid: true } : { valid: false, reason: 'domain_not_found' });
});
