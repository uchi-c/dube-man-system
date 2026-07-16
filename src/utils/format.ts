/* ============================================================
   Uruu OS — Shared formatting helpers
   Single source of truth for currency and number display so
   every module renders figures identically.
   ============================================================ */

/**
 * Currency symbol/code shown before monetary amounts.
 * Change this ONE value to re-label money across the whole app
 * (e.g. 'MWK' or 'K' for Malawian Kwacha, 'ZMW' for Zambian Kwacha).
 */
export const CURRENCY = 'ZMW';

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
