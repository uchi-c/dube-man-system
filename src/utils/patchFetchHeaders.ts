/**
 * Belt-and-suspenders guard against "Failed to execute 'fetch' on
 * 'Window': ... String contains non ISO-8859-1 code point."
 *
 * HTTP header values must be Latin-1 (ISO-8859-1, code points 0x00-0xFF)
 * encodable. Something sharing this page occasionally supplies a header
 * value outside that range (an em dash, smart quote, or similar) — this
 * was traced once to an em dash in static page metadata (index.html/
 * manifest) and fixed there, but the error persisted across devices/fresh
 * sessions afterward, meaning at least one more source exists that hasn't
 * been pinned down (most likely a browser extension or third-party script
 * sharing the page, since a full search of this app's own source found no
 * code that sets custom fetch() headers at all).
 *
 * Rather than let an unidentified header value keep crashing Login/Signup
 * outright, strip only the offending header(s) before the real fetch
 * runs, so the request still goes through. Imported first thing in
 * main.tsx, before anything else touches the network.
 */

const ISO_8859_1_RE = /^[\x00-\xFF]*$/;

function isLatin1(value: string): boolean {
  return ISO_8859_1_RE.test(value);
}

export function sanitizeHeaders(init?: RequestInit): RequestInit | undefined {
  if (!init?.headers) return init;

  const entries: [string, string][] =
    init.headers instanceof Headers
      ? Array.from(init.headers.entries())
      : Array.isArray(init.headers)
      ? (init.headers as [string, string][])
      : Object.entries(init.headers as Record<string, string>);

  const safeEntries = entries.filter(([key, value]) => isLatin1(key) && isLatin1(value));
  if (safeEntries.length === entries.length) return init;

  const dropped = entries.filter(([key, value]) => !isLatin1(key) || !isLatin1(value)).map(([key]) => key);
  console.warn(`[fetch] Dropped header(s) with non-ISO-8859-1 values to avoid a crash: ${dropped.join(', ')}`);

  return { ...init, headers: safeEntries };
}

export function installFetchHeaderGuard(): void {
  if (typeof window === 'undefined' || !window.fetch) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => originalFetch(input, sanitizeHeaders(init))) as typeof window.fetch;
}
