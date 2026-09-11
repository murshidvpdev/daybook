import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attaches a request ID for log correlation and basic security headers.
    Rate limiting and CSRF live at the reverse-proxy / auth-router level respectively
    and are not duplicated here."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Server-Timing"] = f"app;dur={duration_ms:.1f}"
        return response
