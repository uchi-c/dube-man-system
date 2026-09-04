/**
 * src/utils/pageMeta.ts
 * Every unauthenticated view (landing, signup, privacy, terms) is rendered
 * client-side from the same index.html, which only ever carries one static
 * <title>/<meta name="description"> — so every page looked identical to
 * search engines and browser tabs alike. Call this from a useEffect keyed
 * on the active view to give each one its own.
 *
 * Does NOT touch the canonical tag: this app uses HashRouter (see
 * main.tsx), so "/privacy" and "/terms" are never real, separately
 * fetchable URLs — only https://uruu.enterprises/ is. Pointing canonical
 * at a path that 404s with no fragment would be actively wrong, not an
 * improvement. Real per-page canonicals need a router migration first
 * (BrowserRouter + a Vercel SPA-fallback rewrite) -- see the note left in
 * this session's chat about that.
 */
export function setPageMeta(title: string, description?: string): void {
  document.title = title;
  if (description) {
    const tag = document.querySelector('meta[name="description"]');
    if (tag) tag.setAttribute('content', description);
  }
}
