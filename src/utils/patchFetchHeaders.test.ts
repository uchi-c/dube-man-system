import { describe, it, expect } from 'vitest';
import { sanitizeHeaders } from './patchFetchHeaders';

describe('sanitizeHeaders', () => {
  it('leaves a request with no headers untouched', () => {
    const init = { method: 'GET' };
    expect(sanitizeHeaders(init)).toBe(init);
  });

  it('leaves all-Latin1 headers untouched', () => {
    const init = { headers: { 'Content-Type': 'application/json', 'X-Client-Info': 'supabase-js/2.0.0' } };
    expect(sanitizeHeaders(init)).toEqual(init);
  });

  it('drops a header value containing an em dash', () => {
    const init = { headers: { 'Content-Type': 'application/json', 'X-Page-Title': 'Uruu OS — Overview' } };
    const result = sanitizeHeaders(init) as { headers: [string, string][] };
    expect(result.headers).toEqual([['Content-Type', 'application/json']]);
  });

  it('drops a header whose key itself is non-Latin1', () => {
    const init = { headers: { 'X-Emoji-🔥': 'value' } };
    const result = sanitizeHeaders(init) as { headers: [string, string][] };
    expect(result.headers).toEqual([]);
  });

  it('leaves a valid Headers instance untouched (a bad value can\'t reach here at all — the platform\'s Headers.set() throws before construction completes, independent of fetch)', () => {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    const result = sanitizeHeaders({ headers }) as { headers: RequestInit['headers'] };
    expect(result.headers).toBe(headers);
  });

  it('handles an array-of-tuples headers input', () => {
    const init = { headers: [['Content-Type', 'application/json'], ['X-Bad', 'em—dash']] as [string, string][] };
    const result = sanitizeHeaders(init) as { headers: [string, string][] };
    expect(result.headers).toEqual([['Content-Type', 'application/json']]);
  });

  it('accepts Latin-1 accented characters (not just plain ASCII)', () => {
    const init = { headers: { 'X-Name': 'café' } };
    expect(sanitizeHeaders(init)).toEqual(init);
  });
});
