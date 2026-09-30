"""The login + consent page an MCP client (e.g. Claude) sends the user to.

Deliberately a small server-rendered form rather than a React route: it has
to work before the user has a session in the web app, and it hands the result
straight back to the client's redirect URI — the SPA would add nothing.
"""

from html import escape
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Form, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from mcp.server.auth.provider import AuthorizationParams, construct_redirect_uri
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.limiter import limiter
from app.db.session import get_db
from app.mcp.oauth import decode_pending_request, issue_authorization_code
from app.models.oauth import OAuthClient
from app.services.auth import AuthError, authenticate_user

router = APIRouter(prefix="/oauth", include_in_schema=False)
settings = get_settings()

_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    "Cache-Control": "no-store",
}


@router.get("/login", response_class=HTMLResponse)
async def login_page(
    request_token: str | None = Query(None, alias="request"), db: AsyncSession = Depends(get_db)
) -> Response:
    return await _render(db, request_token)


@router.post("/login")
@limiter.limit(lambda: settings.login_rate_limit)
async def login_submit(
    request: Request,
    request_token: str = Form(..., alias="request"),
    email: str = Form(""),
    password: str = Form(""),
    action: str = Form("allow"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    pending = decode_pending_request(request_token)
    if pending is None:
        return _error_page("This sign-in link has expired. Go back to Claude and try connecting again.")
    client_id, params = pending

    if action == "deny":
        return _redirect(params, error="access_denied", error_description="The user declined access")

    try:
        user = await authenticate_user(db, email.strip(), password)
    except AuthError as exc:
        return await _render(db, request_token, error=str(exc), email=email, status_code=401)

    code = await issue_authorization_code(db, client_id, params, user.id)
    return _redirect(params, code=code)


async def _render(
    db: AsyncSession, request_token: str | None, *, error: str | None = None, email: str = "", status_code: int = 200
) -> Response:
    pending = decode_pending_request(request_token) if request_token else None
    if pending is None:
        return _error_page("This sign-in link has expired. Go back to Claude and try connecting again.")
    client_id, params = pending
    client = await db.get(OAuthClient, client_id)
    if client is None:
        return _error_page("This app is no longer registered. Go back to Claude and try connecting again.")

    client_name = client.info.get("client_name") or "An app"
    # Shown so the user can tell a real Claude connection from a lookalike
    # client — the destination host is the one thing a phishing client can't fake.
    destination = urlparse(str(params.redirect_uri)).hostname or str(params.redirect_uri)
    error_html = f'<p class="error">{escape(error)}</p>' if error else ""
    body = f"""
      <h1>Connect to Daybook</h1>
      <p><strong>{escape(client_name)}</strong> wants to read and add to your Daybook routines, habits,
      finances and workouts.</p>
      <p class="muted">You'll be sent back to <strong>{escape(destination)}</strong>.</p>
      {error_html}
      <form method="post" action="login">
        <input type="hidden" name="request" value="{escape(request_token or "")}">
        <label>Email<input type="email" name="email" value="{escape(email)}" autocomplete="username" required
          autofocus></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
        <button type="submit" name="action" value="allow">Sign in and allow</button>
      </form>
      <form method="post" action="login">
        <input type="hidden" name="request" value="{escape(request_token or "")}">
        <button type="submit" name="action" value="deny" class="secondary">Cancel</button>
      </form>"""
    return HTMLResponse(_page(body), status_code=status_code, headers=_HEADERS)


def _redirect(params: AuthorizationParams, **query: str) -> Response:
    url = construct_redirect_uri(str(params.redirect_uri), state=params.state, **query)
    return RedirectResponse(url, status_code=303, headers=_HEADERS)


def _error_page(message: str) -> Response:
    return HTMLResponse(_page(f"<h1>Connect to Daybook</h1><p class='error'>{escape(message)}</p>"), 400, _HEADERS)


def _page(body: str) -> str:
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect to Daybook</title>
<style>
  :root {{ color-scheme: light dark; --bg:#f6f5f2; --card:#fff; --text:#1c1b19; --muted:#6b6862; --line:#dedbd4;
    --accent:#1c1b19; --accent-text:#fff; --error:#b3261e; }}
  @media (prefers-color-scheme: dark) {{ :root {{ --bg:#141413; --card:#1f1e1c; --text:#f1efe9; --muted:#a19d95;
    --line:#34322e; --accent:#f1efe9; --accent-text:#141413; --error:#f2b8b5; }} }}
  body {{ margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--text);
    font:16px/1.5 system-ui, -apple-system, sans-serif; padding:16px; box-sizing:border-box; }}
  main {{ width:100%; max-width:380px; background:var(--card); border:1px solid var(--line); border-radius:16px;
    padding:28px; }}
  h1 {{ font-size:22px; margin:0 0 12px; }}
  p {{ margin:0 0 12px; }}
  .muted {{ color:var(--muted); font-size:14px; }}
  .error {{ color:var(--error); }}
  label {{ display:block; font-size:14px; margin:12px 0 0; }}
  input {{ display:block; width:100%; box-sizing:border-box; margin-top:4px; padding:10px 12px; font:inherit;
    color:inherit; background:transparent; border:1px solid var(--line); border-radius:10px; }}
  button {{ width:100%; margin-top:16px; padding:11px; font:inherit; font-weight:600; border-radius:10px;
    border:1px solid var(--accent); background:var(--accent); color:var(--accent-text); cursor:pointer; }}
  button.secondary {{ margin-top:8px; background:transparent; color:var(--text); border-color:var(--line); }}
</style></head>
<body><main>{body}</main></body></html>"""
