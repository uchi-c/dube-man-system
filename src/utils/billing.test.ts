import { describe, it, expect } from 'vitest';
import { cartTotal, elapsedMinutes, sessionCharge, DEFAULT_RATE_PER_MINUTE } from './billing';

describe('cartTotal', () => {
  it('is zero for an empty cart', () => {
    expect(cartTotal([])).toBe(0);
  });

  it('multiplies unit price by quantity per line and sums', () => {
    expect(
      cartTotal([
        { unitPrice: 55, quantity: 2 },
        { unitPrice: 120, quantity: 1 },
      ])
    ).toBe(230);
  });

  it('handles fractional prices', () => {
    expect(cartTotal([{ unitPrice: 2.5, quantity: 3 }])).toBeCloseTo(7.5, 5);
  });
});

describe('elapsedMinutes', () => {
  const base = Date.parse('2026-01-01T10:00:00Z');

  it('floors partial minutes', () => {
    expect(elapsedMinutes(base, base + 90 * 1000)).toBe(1); // 90s -> 1 min
    expect(elapsedMinutes(base, base + 5 * 60000 + 59 * 1000)).toBe(5);
  });

  it('bills a minimum of one minute even for a just-started session', () => {
    expect(elapsedMinutes(base, base)).toBe(1);
    expect(elapsedMinutes(base, base + 1000)).toBe(1);
  });

  it('never goes negative for clock skew', () => {
    expect(elapsedMinutes(base, base - 120000)).toBe(1);
  });
});

describe('sessionCharge', () => {
  it('multiplies minutes by the rate', () => {
    expect(sessionCharge(30, 1.5)).toBe(45);
  });

  it('falls back to the default rate when rate is missing or zero', () => {
    expect(sessionCharge(10, 0)).toBe(10 * DEFAULT_RATE_PER_MINUTE);
    expect(sessionCharge(10)).toBe(10 * DEFAULT_RATE_PER_MINUTE);
  });
});
