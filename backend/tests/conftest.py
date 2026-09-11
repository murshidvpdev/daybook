from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.limiter import limiter
from app.db.session import get_db
from app.main import app
from app.models import Base

TEST_DATABASE_URL = "postgresql+asyncpg://daybook:daybook@localhost:5432/daybook_test"


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Creates a fresh engine per test, bound to that test's own event loop —
    an async engine created at import time and reused across tests deadlocks
    against asyncpg once pytest-asyncio hands each test a new loop."""
    engine = create_async_engine(TEST_DATABASE_URL)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    # Every test's requests appear to come from the same synthetic client
    # address, so without a reset the per-IP auth rate limits (5/min on
    # register, etc.) would trip from one test's traffic bleeding into the next.
    limiter.reset()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.pop(get_db, None)
    await engine.dispose()


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    await client.post(
        "/api/v1/auth/register",
        json={"email": "murshid@example.com", "password": "correcthorsebattery"},
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "murshid@example.com", "password": "correcthorsebattery"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
