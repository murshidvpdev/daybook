"""The remote MCP connector end to end: OAuth discovery → client registration →
authorize → login page → token → calling tools over /mcp, exactly the sequence
Claude runs when someone adds the connector."""

import asyncio
import base64
import hashlib
import json
import secrets
from collections.abc import AsyncGenerator
from urllib.parse import parse_qs, urlparse

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.mcp import mcp_app
from app.mcp.server import provider
from tests.conftest import TEST_DATABASE_URL

REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback"
RESOURCE = "http://localhost:8000/mcp"
PASSWORD = "correcthorsebattery"


@pytest_asyncio.fixture
async def mcp_client(client: AsyncClient) -> AsyncGenerator[AsyncClient, None]:
    """`client`, plus the MCP session manager running and the OAuth provider
    pointed at the test database (it opens its own sessions, outside FastAPI's
    get_db dependency that conftest overrides)."""
    engine = create_async_engine(TEST_DATABASE_URL)
    original = provider.session_factory
    provider.session_factory = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)
    # The session manager's task group must be entered and exited in the same
    # task, and pytest-asyncio runs fixture setup and teardown in different ones.
    started, stop = asyncio.Event(), asyncio.Event()

    async def run() -> None:
        async with mcp_app.lifespan():
            started.set()
            await stop.wait()

    task = asyncio.create_task(run())
    await started.wait()
    yield client
    stop.set()
    await task
    provider.session_factory = original
    await engine.dispose()


async def _register_user(client: AsyncClient, email: str) -> dict[str, str]:
    await client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD})
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _register_client(client: AsyncClient) -> str:
    resp = await client.post(
        "/oauth/register",
        json={
            "redirect_uris": [REDIRECT_URI],
            "client_name": "Claude",
            "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["client_id"]


async def _start_authorization(client: AsyncClient, client_id: str) -> tuple[str, str]:
    """Runs /oauth/authorize and returns (login page path, PKCE verifier)."""
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    resp = await client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": REDIRECT_URI,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": "xyz",
            "resource": RESOURCE,
        },
    )
    assert resp.status_code == 302, resp.text
    location = urlparse(resp.headers["location"])
    assert location.path == "/oauth/login"
    return f"{location.path}?{location.query}", verifier


async def _connect(client: AsyncClient, email: str) -> dict:
    """The whole OAuth dance for one user; returns the token response."""
    client_id = await _register_client(client)
    login_path, verifier = await _start_authorization(client, client_id)
    request_token = parse_qs(urlparse(login_path).query)["request"][0]

    resp = await client.post(
        "/oauth/login", data={"request": request_token, "email": email, "password": PASSWORD, "action": "allow"}
    )
    assert resp.status_code == 303, resp.text
    callback = urlparse(resp.headers["location"])
    assert f"{callback.scheme}://{callback.netloc}{callback.path}" == REDIRECT_URI
    query = parse_qs(callback.query)
    assert query["state"] == ["xyz"]

    resp = await client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": query["code"][0],
            "redirect_uri": REDIRECT_URI,
            "client_id": client_id,
            "code_verifier": verifier,
            "resource": RESOURCE,
        },
    )
    assert resp.status_code == 200, resp.text
    return {**resp.json(), "client_id": client_id}


async def _call_tool(client: AsyncClient, access_token: str, name: str, arguments: dict | None = None):
    resp = await client.post(
        "/mcp",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-06-18",
        },
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments or {}}},
    )
    return resp


async def test_discovery_points_claude_at_the_oauth_server(mcp_client: AsyncClient) -> None:
    resp = await mcp_client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert resp.status_code == 401
    assert "/.well-known/oauth-protected-resource/mcp" in resp.headers["www-authenticate"]

    resource = (await mcp_client.get("/.well-known/oauth-protected-resource/mcp")).json()
    assert resource["resource"] == RESOURCE
    assert resource["authorization_servers"] == ["http://localhost:8000/oauth"]

    server = (await mcp_client.get("/.well-known/oauth-authorization-server/oauth")).json()
    assert server["issuer"] == "http://localhost:8000/oauth"
    assert server["authorization_endpoint"] == "http://localhost:8000/oauth/authorize"
    assert server["token_endpoint"] == "http://localhost:8000/oauth/token"
    assert server["registration_endpoint"] == "http://localhost:8000/oauth/register"
    assert server["code_challenge_methods_supported"] == ["S256"]


async def test_full_connect_flow_then_call_a_tool(mcp_client: AsyncClient) -> None:
    headers = await _register_user(mcp_client, "murshid@example.com")
    await mcp_client.post("/api/v1/habits", json={"name": "Read"}, headers=headers)

    tokens = await _connect(mcp_client, "murshid@example.com")

    initialize = await mcp_client.post(
        "/mcp",
        headers={"Authorization": f"Bearer {tokens['access_token']}", "Accept": "application/json, text/event-stream"},
        json={
            "jsonrpc": "2.0",
            "id": 0,
            "method": "initialize",
            "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}},
        },
    )
    assert initialize.status_code == 200, initialize.text
    assert initialize.json()["result"]["serverInfo"]["name"] == "daybook"

    resp = await _call_tool(mcp_client, tokens["access_token"], "list_habits")
    assert resp.status_code == 200, resp.text
    result = resp.json()["result"]
    assert result["isError"] is False
    habits = json.loads(result["content"][0]["text"])
    assert [h["name"] for h in habits] == ["Read"]


async def test_login_page_shows_client_and_rejects_wrong_password(mcp_client: AsyncClient) -> None:
    await _register_user(mcp_client, "murshid@example.com")
    client_id = await _register_client(mcp_client)
    login_path, _ = await _start_authorization(mcp_client, client_id)

    page = await mcp_client.get(login_path)
    assert page.status_code == 200
    assert "Claude" in page.text and "claude.ai" in page.text

    request_token = parse_qs(urlparse(login_path).query)["request"][0]
    resp = await mcp_client.post(
        "/oauth/login", data={"request": request_token, "email": "murshid@example.com", "password": "wrong-password"}
    )
    assert resp.status_code == 401
    assert "Incorrect email or password" in resp.text


async def test_cancel_sends_access_denied_back(mcp_client: AsyncClient) -> None:
    client_id = await _register_client(mcp_client)
    login_path, _ = await _start_authorization(mcp_client, client_id)
    request_token = parse_qs(urlparse(login_path).query)["request"][0]

    resp = await mcp_client.post("/oauth/login", data={"request": request_token, "action": "deny"})
    assert resp.status_code == 303
    assert parse_qs(urlparse(resp.headers["location"]).query)["error"] == ["access_denied"]


async def test_tampered_login_request_is_rejected(mcp_client: AsyncClient) -> None:
    resp = await mcp_client.post(
        "/oauth/login", data={"request": "not-a-signed-request", "email": "a@example.com", "password": PASSWORD}
    )
    assert resp.status_code == 400
    assert "expired" in resp.text


async def test_authorization_code_is_single_use(mcp_client: AsyncClient) -> None:
    await _register_user(mcp_client, "murshid@example.com")
    client_id = await _register_client(mcp_client)
    login_path, verifier = await _start_authorization(mcp_client, client_id)
    request_token = parse_qs(urlparse(login_path).query)["request"][0]
    resp = await mcp_client.post(
        "/oauth/login", data={"request": request_token, "email": "murshid@example.com", "password": PASSWORD}
    )
    code = parse_qs(urlparse(resp.headers["location"]).query)["code"][0]
    exchange = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": client_id,
        "code_verifier": verifier,
    }

    assert (await mcp_client.post("/oauth/token", data=exchange)).status_code == 200
    assert (await mcp_client.post("/oauth/token", data=exchange)).status_code == 400


async def test_wrong_pkce_verifier_is_rejected(mcp_client: AsyncClient) -> None:
    await _register_user(mcp_client, "murshid@example.com")
    client_id = await _register_client(mcp_client)
    login_path, _ = await _start_authorization(mcp_client, client_id)
    request_token = parse_qs(urlparse(login_path).query)["request"][0]
    resp = await mcp_client.post(
        "/oauth/login", data={"request": request_token, "email": "murshid@example.com", "password": PASSWORD}
    )
    code = parse_qs(urlparse(resp.headers["location"]).query)["code"][0]

    resp = await mcp_client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "client_id": client_id,
            "code_verifier": secrets.token_urlsafe(48),
        },
    )
    assert resp.status_code == 400


async def test_tools_only_see_the_connected_users_data(mcp_client: AsyncClient) -> None:
    """The MCP equivalent of test_cannot_access_another_users_routine."""
    alice = await _register_user(mcp_client, "alice@example.com")
    await _register_user(mcp_client, "bob@example.com")
    alice_habit = (await mcp_client.post("/api/v1/habits", json={"name": "Alice's"}, headers=alice)).json()

    bob = await _connect(mcp_client, "bob@example.com")

    resp = await _call_tool(mcp_client, bob["access_token"], "list_habits")
    assert json.loads(resp.json()["result"]["content"][0]["text"]) == []

    resp = await _call_tool(mcp_client, bob["access_token"], "toggle_habit", {"habit_id": alice_habit["id"]})
    result = resp.json()["result"]
    assert result["isError"] is True
    assert "404" in result["content"][0]["text"]


async def test_refresh_rotates_both_tokens(mcp_client: AsyncClient) -> None:
    await _register_user(mcp_client, "murshid@example.com")
    first = await _connect(mcp_client, "murshid@example.com")

    refresh = {"grant_type": "refresh_token", "refresh_token": first["refresh_token"], "client_id": first["client_id"]}
    resp = await mcp_client.post("/oauth/token", data=refresh)
    assert resp.status_code == 200, resp.text
    second = resp.json()

    assert (await mcp_client.post("/oauth/token", data=refresh)).status_code == 400
    assert (await _call_tool(mcp_client, first["access_token"], "list_habits")).status_code == 401
    assert (await _call_tool(mcp_client, second["access_token"], "list_habits")).status_code == 200


async def test_disabling_a_user_cuts_off_their_connector(mcp_client: AsyncClient, admin_headers: dict) -> None:
    await _register_user(mcp_client, "murshid@example.com")
    tokens = await _connect(mcp_client, "murshid@example.com")
    users = (await mcp_client.get("/api/v1/admin/users", headers=admin_headers)).json()
    user_id = next(u["id"] for u in users if u["email"] == "murshid@example.com")

    resp = await mcp_client.post(f"/api/v1/admin/users/{user_id}/active", json={"is_active": False}, headers=admin_headers)
    assert resp.status_code == 204, resp.text

    assert (await _call_tool(mcp_client, tokens["access_token"], "list_habits")).status_code == 401
    refresh = {"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"], "client_id": tokens["client_id"]}
    assert (await mcp_client.post("/oauth/token", data=refresh)).status_code == 400


async def test_token_for_another_resource_is_refused(mcp_client: AsyncClient) -> None:
    client_id = await _register_client(mcp_client)
    resp = await mcp_client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": REDIRECT_URI,
            "code_challenge": "x" * 43,
            "code_challenge_method": "S256",
            "state": "xyz",
            "resource": "https://evil.example.com/mcp",
        },
    )
    assert resp.status_code == 302
    assert parse_qs(urlparse(resp.headers["location"]).query)["error"] == ["invalid_target"]


async def test_ids_that_are_not_uuids_never_reach_the_api(mcp_client: AsyncClient) -> None:
    """IDs are interpolated into API paths — a crafted one mustn't be able to
    steer the call to a different endpoint."""
    await _register_user(mcp_client, "murshid@example.com")
    tokens = await _connect(mcp_client, "murshid@example.com")

    resp = await _call_tool(mcp_client, tokens["access_token"], "toggle_habit", {"habit_id": "../../routines"})
    assert resp.json()["result"]["isError"] is True


async def test_date_arguments_are_passed_through(mcp_client: AsyncClient) -> None:
    headers = await _register_user(mcp_client, "murshid@example.com")
    habit = (await mcp_client.post("/api/v1/habits", json={"name": "Read"}, headers=headers)).json()
    tokens = await _connect(mcp_client, "murshid@example.com")

    resp = await _call_tool(
        mcp_client, tokens["access_token"], "toggle_habit", {"habit_id": habit["id"], "on": "2026-09-01"}
    )
    assert resp.json()["result"]["isError"] is False, resp.text
    resp = await _call_tool(mcp_client, tokens["access_token"], "list_transactions", {"start": "2026-09-01"})
    assert resp.json()["result"]["isError"] is False, resp.text
    report = await _call_tool(mcp_client, tokens["access_token"], "get_day_report", {"report_date": "2026-09-01"})
    assert json.loads(report.json()["result"]["content"][0]["text"])["habits_done"][0]["name"] == "Read"


async def test_monthly_cashflow_tool_separates_lending_from_income(mcp_client: AsyncClient) -> None:
    headers = await _register_user(mcp_client, "murshid@example.com")
    account = (
        await mcp_client.post(
            "/api/v1/finance/accounts", json={"name": "HDFC Bank", "account_type": "bank"}, headers=headers
        )
    ).json()
    await mcp_client.post(
        "/api/v1/finance/transactions",
        json={"account_id": account["id"], "kind": "income", "amount": "50000", "occurred_on": "2026-09-01"},
        headers=headers,
    )
    await mcp_client.post(
        "/api/v1/finance/lendings",
        json={
            "person_name": "Rahul",
            "direction": "borrowed",
            "amount": "5000",
            "account_id": account["id"],
            "given_on": "2026-09-10",
        },
        headers=headers,
    )
    tokens = await _connect(mcp_client, "murshid@example.com")

    resp = await _call_tool(
        mcp_client, tokens["access_token"], "get_monthly_cashflow", {"year": 2026, "month": 9, "months": 1}
    )
    assert resp.json()["result"]["isError"] is False, resp.text
    [sept] = json.loads(resp.json()["result"]["content"][0]["text"])
    assert float(sept["income"]) == 50000.0
    assert float(sept["lending_in"]) == 5000.0
    assert float(sept["saved"]) == 50000.0
