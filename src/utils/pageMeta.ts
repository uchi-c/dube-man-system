/**
 * src/utils/pageMeta.ts
 * Every unauthenticated view (landing, signup, privacy, terms) is rendered
 * client-side from the same index.html, which only ever carries one static
 * <title>/<meta name="description">/canonical -- so every page looked
 * identical to search engines and browser tabs alike. Call this from a
 * useEffect keyed on the active view to give each one its own.
 *
 * Now safe to vary the canonical per view: the app moved from HashRouter
 * to BrowserRouter (see main.tsx) with a Vercel SPA-fallback rewrite (see
 * vercel.json), so /privacy, /terms, and /signup are real, directly
 * fetchable URLs -- not client-only hash fragments a canonical pointing at
 * them would have lied about.
 */
export function setPageMeta(title: string, description?: string, path = '/'): void {
  document.title = title;
  if (description) {
    const tag = document.querySelector('meta[name="description"]');
    if (tag) tag.setAttribute('content', description);
  }
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', `https://uruu.enterprises${path}`);
}
