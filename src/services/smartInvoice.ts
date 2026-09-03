/**
 * src/services/smartInvoice.ts
 * ZRA Smart Invoice (VSDC) — scaffold. smart_invoice_settings is a single
 * per-org row, RLS-gated to org admins only (migration 025), so these are
 * plain direct-table reads/writes the same way print pricing settings work
 * (src/services/supabase.ts's fetchPrintPricingSettings), not RPCs.
 *
 * Device init and sale submission call the zra-smart-invoice edge function
 * instead, since those need to make an outbound HTTPS call to the org's own
 * VSDC server — not something a browser should do directly (CORS, and the
 * VSDC server URL living on the tenant's own network).
 */
import { supabase } from './supabase';
import { getCurrentOrganizationId } from './organizations';
import { SmartInvoiceSettings } from '../types';

export async function fetchSmartInvoiceSettings(): Promise<SmartInvoiceSettings | null> {
  const { data, error } = await supabase
    .from('smart_invoice_settings')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as SmartInvoiceSettings) ?? null;
}

export type SmartInvoiceSettingsInput = Pick<
  SmartInvoiceSettings,
  'environment' | 'tpin' | 'branch_id' | 'device_serial_no' | 'vsdc_base_url' | 'is_enabled'
>;

export async function saveSmartInvoiceSettings(input: SmartInvoiceSettingsInput): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase
    .from('smart_invoice_settings')
    .select('id')
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const { error } = existing
    ? await supabase.from('smart_invoice_settings').update(input).eq('id', existing.id)
    : await supabase
        .from('smart_invoice_settings')
        .insert([{ ...input, organization_id: await getCurrentOrganizationId() }]);
  if (error) throw error;
}

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

export async function initSmartInvoiceDevice(): Promise<{ success: boolean; resultCd?: string; raw?: unknown }> {
  const { data, error } = await supabase.functions.invoke('zra-smart-invoice', { body: { action: 'init' } });
  if (error) throw new Error(await resolveEdgeFunctionError(error, 'Could not initialize the device with ZRA.'));
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function submitSaleToSmartInvoice(saleId: string): Promise<{ success: boolean; resultCd?: string; raw?: unknown }> {
  const { data, error } = await supabase.functions.invoke('zra-smart-invoice', {
    body: { action: 'submit-sale', saleId },
  });
  if (error) throw new Error(await resolveEdgeFunctionError(error, 'Could not submit this sale to ZRA.'));
  if (data?.error) throw new Error(data.error);
  return data;
}
