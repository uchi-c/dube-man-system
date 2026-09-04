/**
 * src/services/emailVerification.ts
 * Catches a typo'd or fake email domain at signup time — see
 * supabase/functions/verify-email-domain for the actual DNS check.
 * Fails open: any network/invoke problem is treated as "can't tell,
 * don't block" rather than "invalid" — the checker itself being briefly
 * unreachable should never be why someone can't sign up.
 */
import { supabase } from './supabase';

export type EmailDomainCheck = { valid: boolean; reason?: string };

const REASON_MESSAGES: Record<string, string> = {
  malformed: "That doesn't look like a valid email address.",
  disposable_domain: 'Disposable/temporary email addresses are not accepted — use one you actually check.',
  domain_not_found: "That domain doesn't appear to accept email — double check for typos.",
};

export function describeEmailDomainReason(reason?: string): string {
  return (reason && REASON_MESSAGES[reason]) || "That email address doesn't look right — double check it.";
}

export async function checkEmailDomain(email: string): Promise<EmailDomainCheck> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-email-domain', { body: { email } });
    if (error || !data) return { valid: true };
    return data as EmailDomainCheck;
  } catch {
    return { valid: true };
  }
}
