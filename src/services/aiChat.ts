/**
 * src/services/aiChat.ts
 * In-app AI chatbot — calls the ai-chat edge function, which runs
 * server-side with the caller's own forwarded JWT (never service-role),
 * so a tenant user only ever gets tools scoped to their own org and a
 * platform admin gets cross-tenant tools instead. See
 * supabase/functions/ai-chat/index.ts for the actual tool definitions.
 */
import { supabase } from './supabase';

export type AiChatMessage = { role: 'user' | 'assistant'; content: string };

async function resolveEdgeFunctionError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  try {
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      if (body?.error) return body.error as string;
    }
  } catch {
    // Body wasn't JSON — fall through to the generic message.
  }
  return (error as any)?.message || fallback;
}

export async function sendAiChatMessage(messages: AiChatMessage[]): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-chat', { body: { messages } });
  if (error) throw new Error(await resolveEdgeFunctionError(error, "Couldn't reach the assistant."));
  if (data?.error) throw new Error(data.error);
  return data.reply as string;
}
