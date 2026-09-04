/* ============================================================
   Uruu OS — Shared formatting helpers
   Single source of truth for currency and number display so
   every module renders figures identically.
   ============================================================ */

/**
 * Currency symbol/code shown before monetary amounts. Defaults to 'ZMW'
 * and is switched to the active organization's own choice by
 * setCurrency() (see services/organizations.ts's getCurrentOrganization
 * Currency, called from App.tsx on session restore/login) — a plain `let`
 * rather than a `const` so every existing `import { CURRENCY }` site picks
 * up the change automatically via ES modules' live bindings.
 */
export let CURRENCY = 'ZMW';

/** Sets the app-wide currency label. Falls back to 'ZMW' for anything but the two currencies tenants can choose. */
export function setCurrency(currency: string): void {
  CURRENCY = currency === 'USD' ? 'USD' : 'ZMW';
}

/**
 * Format a monetary amount with the shared currency label and
 * exactly two decimal places, grouped by thousands.
 *   formatCurrency(1500)  -> "ZMW 1,500.00"
 */
export function formatCurrency(
  amount: number | null | undefined,
  { symbol = true, decimals = 2 }: { symbol?: boolean; decimals?: number } = {}
): string {
  const n = Number.isFinite(amount as number) ? (amount as number) : 0;
  const body = n.toLocaleString('en', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return symbol ? `${CURRENCY} ${body}` : body;
}

/**
 * Format a plain count/number with thousands separators.
 *   formatNumber(12000) -> "12,000"
 */
export function formatNumber(
  value: number | null | undefined,
  decimals = 0
): string {
  const n = Number.isFinite(value as number) ? (value as number) : 0;
  return n.toLocaleString('en', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
