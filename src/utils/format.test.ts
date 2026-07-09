import { describe, it, expect } from 'vitest';
import { formatCurrency, formatNumber, CURRENCY } from './format';

describe('formatCurrency', () => {
  it('prefixes the currency symbol and shows two decimals', () => {
    expect(formatCurrency(1500)).toBe(`${CURRENCY} 1,500.00`);
  });

  it('groups thousands', () => {
    expect(formatCurrency(1234567.5)).toBe(`${CURRENCY} 1,234,567.50`);
  });

  it('can omit the symbol', () => {
    expect(formatCurrency(90, { symbol: false })).toBe('90.00');
  });

  it('honours a custom decimal count', () => {
    expect(formatCurrency(0.125, { decimals: 3 })).toBe(`${CURRENCY} 0.125`);
  });

  it('coerces null/undefined/NaN to zero', () => {
    expect(formatCurrency(undefined)).toBe(`${CURRENCY} 0.00`);
    expect(formatCurrency(null)).toBe(`${CURRENCY} 0.00`);
    expect(formatCurrency(NaN)).toBe(`${CURRENCY} 0.00`);
  });
});

describe('formatNumber', () => {
  it('groups thousands with no decimals by default', () => {
    expect(formatNumber(12000)).toBe('12,000');
  });

  it('supports a decimal count', () => {
    expect(formatNumber(3.14159, 2)).toBe('3.14');
  });
});
