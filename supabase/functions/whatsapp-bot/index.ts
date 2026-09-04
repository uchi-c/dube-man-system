// supabase/functions/whatsapp-bot/index.ts
//
// SCAFFOLD -- not deployed, not wired to Twilio. Twilio's WhatsApp
// integration itself (task #35, SMS/WhatsApp receipts and reminders) is
// blocked on credentials the tenant hasn't provided yet: Account SID,
// Auth Token, a WhatsApp-enabled sender number. This exists so the AI
// layer (see ai.ts) has a real caller to demonstrate against once that
// arrives.
//
// Before this can go live as an actual Twilio webhook target:
//   - Replace the generic JSON body below with Twilio's actual inbound
//     webhook shape (form-encoded, fields like Body/From/To).
//   - Verify the X-Twilio-Signature header instead of relying on
//     Supabase's verify_jwt (Twilio doesn't send a Supabase JWT) --
//     verify_jwt must be turned off for this function once that's in
//     place, exactly like the other webhook-style functions in this repo.
//   - Reply via TwiML (or the Twilio REST API), not a bare JSON response.
import { summarizeIncidentReport } from './ai.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }

  let body: { report?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!body.report?.trim()) {
    return new Response(JSON.stringify({ error: '"report" is required' }), { status: 400 });
  }

  try {
    const summary = await summarizeIncidentReport(body.report);
    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500 });
  }
});
