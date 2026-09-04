/**
 * src/services/flutterwave.ts
 * Mobile money push-payment collection — see supabase/functions/
 * flutterwave-charge for the actual Flutterwave call. Only ever follows
 * up on a sale already recorded with payment_method 'Mobile Money'; never
 * changes that sale's payment_status/amount_paid (see migration 035).
 */
import { supabase } from './supabase';

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

export type MobileMoneyNetwork = 'MTN' | 'AIRTEL' | 'ZAMTEL';

export async function sendMobileMoneyPushCharge(
  saleId: string,
  phoneNumber: string,
  network: MobileMoneyNetwork
): Promise<{ status: string; reference: string }> {
  const { data, error } = await supabase.functions.invoke('flutterwave-charge', {
    body: { sale_id: saleId, phone_number: phoneNumber, network },
  });
  if (error) throw new Error(await resolveEdgeFunctionError(error, "Couldn't send the payment request."));
  if (data?.error) throw new Error(data.error);
  return data;
}
