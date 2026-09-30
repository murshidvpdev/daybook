from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.limiter import limiter
from app.core.middleware import RequestContextMiddleware
from app.mcp import login_router, mcp_app, oauth_routes

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    async with mcp_app.lifespan():
        yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(RequestContextMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
# The login page first: it lives under /oauth too, and would otherwise be
# shadowed by the SDK's /oauth mount below.
app.include_router(login_router)
app.router.routes.extend(oauth_routes)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


# Last, since it's a catch-all mount: /mcp and its /.well-known metadata.
app.mount("/", mcp_app)
