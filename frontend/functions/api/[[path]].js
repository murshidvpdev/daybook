// Cloudflare Pages Function: proxies everything under /api/* to the Render
// backend. Exists because Cloudflare's declarative `_redirects` 200-status
// proxy rule didn't take effect on this project (likely the newer unified
// Workers+assets pipeline handling `_redirects` differently than classic
// Pages) — this achieves the same goal explicitly instead: the browser only
// ever talks to one origin (this Pages domain), so the refresh-token cookie
// stays a normal same-site cookie rather than needing SameSite=None, which
// iOS Safari treats unreliably for cross-site cookies.
const BACKEND_ORIGIN = "https://daybook-5dls.onrender.com";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetUrl = BACKEND_ORIGIN + url.pathname + url.search;
  const proxied = new Request(targetUrl, context.request);
  return fetch(proxied);
}
