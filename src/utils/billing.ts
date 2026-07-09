/* ============================================================
   Dube Man Innovation — Billing math
   Pure, framework-free helpers so the money paths (POS cart and
   café time-billing) are testable and shared instead of inlined.
   ============================================================ */

/** Default café rate applied when a workstation has no explicit rate. */
export const DEFAULT_RATE_PER_MINUTE = 1;

export interface LineItem {
  unitPrice: number;
  quantity: number;
}

/** Sum of unit price × quantity for every line in a POS cart. */
export function cartTotal(items: LineItem[]): number {
  return items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
}

/**
 * Whole minutes elapsed between two epoch-millisecond timestamps,
 * floored, with a minimum of 1 (a started session always bills ≥1 min).
 */
export function elapsedMinutes(startMs: number, nowMs: number): number {
  return Math.max(1, Math.floor((nowMs - startMs) / 60000));
}

/** Charge for a café session: minutes × per-minute rate. */
export function sessionCharge(
  minutes: number,
  ratePerMinute: number = DEFAULT_RATE_PER_MINUTE
): number {
  return minutes * (ratePerMinute || DEFAULT_RATE_PER_MINUTE);
}
