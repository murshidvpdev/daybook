// Cloudflare Pages Function: proxies everything under /api/* to the Render
// backend. Exists because Cloudflare's declarative `_redirects` 200-status
// proxy rule didn't take effect on this project (likely the newer unified
// Workers+assets pipeline handling `_redirects` differently than classic
// Pages) — this achieves the same goal explicitly instead: the browser only
// ever talks to one origin (this Pages domain), so the refresh-token cookie
// stays a normal same-site cookie rather than needing SameSite=None, which
// iOS Safari treats unreliably for cross-site cookies.
// TEMPORARY: pointed at the AWS EC2 backend (see ARCHITECTURE.md / the AWS
// migration in progress) while CloudFront is blocked on AWS account
// verification. Revert to "https://daybook-5dls.onrender.com" once the
// S3 + CloudFront setup is finished — this is a stand-in, not the final home.
// Must be a hostname, not a raw IP — Cloudflare's fetch() rejects direct-IP
// origins with "error code: 1003".
const BACKEND_ORIGIN = "http://ec2-65-1-218-176.ap-south-1.compute.amazonaws.com";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetUrl = BACKEND_ORIGIN + url.pathname + url.search;
  const proxied = new Request(targetUrl, context.request);
  return fetch(proxied);
}
