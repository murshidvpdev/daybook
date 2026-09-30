"""Remote MCP connector: lets Claude (or any MCP client) use Daybook as the
signed-in user, via "Add custom connector" → {PUBLIC_URL}/mcp.

URL layout, all on the public origin (Cloudflare Pages proxies these to EC2):
  /mcp                                              the MCP endpoint (bearer-token protected)
  /.well-known/oauth-protected-resource/mcp         RFC 9728: which authorization server guards /mcp
  /.well-known/oauth-authorization-server/oauth     RFC 8414: that server's endpoints
  /oauth/register, /oauth/authorize, /oauth/token, /oauth/revoke    (MCP SDK handlers)
  /oauth/login                                      our login + consent page (app/mcp/login.py)
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from mcp.server.auth.handlers.metadata import MetadataHandler
from mcp.server.auth.routes import build_metadata, create_auth_routes
from mcp.server.auth.settings import ClientRegistrationOptions, RevocationOptions
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import AnyHttpUrl
from starlette.responses import PlainTextResponse
from starlette.routing import BaseRoute, Mount, Route
from starlette.types import Receive, Scope, Send

from app.mcp.login import router as login_router
from app.mcp.oauth import ISSUER_URL
from app.mcp.server import mcp, provider

__all__ = ["login_router", "mcp_app", "oauth_routes"]


def _build_oauth_routes() -> list[BaseRoute]:
    issuer_url = AnyHttpUrl(ISSUER_URL)
    registration = ClientRegistrationOptions(enabled=True)
    revocation = RevocationOptions(enabled=True)
    metadata = build_metadata(issuer_url, None, registration, revocation)
    return [
        # RFC 8414 puts a path-bearing issuer's metadata at the root with the
        # path appended, which is where MCP clients look first. A plain
        # function endpoint, unlike the SDK's CORS-wrapped one, so SlowAPI's
        # middleware can look it up by name like every other route.
        Route(
            "/.well-known/oauth-authorization-server/oauth",
            endpoint=MetadataHandler(metadata).handle,
            methods=["GET"],
        ),
        # The SDK's own routes (including metadata at the older
        # /oauth/.well-known/... location) under the issuer's path.
        Mount(
            "/oauth",
            routes=create_auth_routes(
                provider=provider,
                issuer_url=issuer_url,
                client_registration_options=registration,
                revocation_options=revocation,
            ),
        ),
    ]


class _MCPApp:
    """ASGI app for /mcp and its protected-resource metadata.

    The SDK's session manager can only be started once, so a fresh one is
    built per application lifespan — once in production, once per test there."""

    def __init__(self) -> None:
        self._app = None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self._app is None:
            await PlainTextResponse("MCP server not started", status_code=503)(scope, receive, send)
            return
        await self._app(scope, receive, send)

    @asynccontextmanager
    async def lifespan(self) -> AsyncIterator[None]:
        app = mcp.streamable_http_app(
            streamable_http_path="/mcp",
            # Plain JSON request/response, no server-held sessions: nothing to
            # lose on a container restart, and nothing for Cloudflare's proxy
            # to buffer or time out on a long-lived event stream.
            stateless_http=True,
            json_response=True,
            # DNS-rebinding protection guards servers on localhost; this one is
            # public and bearer-token protected, and sees EC2's Host header via
            # the proxy rather than the public one.
            transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
        )
        async with mcp.session_manager.run():
            self._app = app
            try:
                yield
            finally:
                self._app = None


oauth_routes = _build_oauth_routes()
mcp_app = _MCPApp()
