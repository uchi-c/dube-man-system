// supabase/functions/whatsapp-bot/ai.ts
//
// AI helper for the future WhatsApp bot. Not wired to Twilio yet -- that
// half of the feature is still blocked on Twilio credentials (Account SID,
// Auth Token, WhatsApp-enabled sender number). This module exists so the
// model choice is settled and ready the moment Twilio is connected.
//
// Model: minimax/minimax-m3-free via the Vercel AI SDK's model-string
// routing, which resolves through the Vercel AI Gateway rather than a
// direct per-provider SDK. That needs an AI_GATEWAY_API_KEY set as a
// Supabase Edge Function secret (Dashboard -> Edge Functions -> Secrets)
// -- outside of a Vercel deployment (this runs on Supabase/Deno) the
// Gateway has no other way to authenticate the request.
//
// generateText() is used instead of the streamText() this was scoped
// with, because a WhatsApp reply is a single Twilio webhook response, not
// a token-by-token UI stream -- there's nothing on the other end to
// consume partial chunks, so collecting the full text before responding
// is both simpler and correct here.
import { generateText } from 'npm:ai@5';

const MODEL = 'minimax/minimax-m3-free';

/** Summarizes a free-text incident/issue report into a short WhatsApp-friendly reply. */
export async function summarizeIncidentReport(reportText: string): Promise<string> {
  const { text } = await generateText({
    model: MODEL,
    prompt: `Summarize the following incident report in 2-3 short sentences, plain text, suitable for a WhatsApp message:\n\n${reportText}`,
  });
  return text;
}
