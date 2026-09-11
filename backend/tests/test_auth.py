from httpx import AsyncClient


async def test_register_then_login(client: AsyncClient) -> None:
    register = await client.post(
        "/api/v1/auth/register",
        json={"email": "new@example.com", "password": "correcthorsebattery"},
    )
    assert register.status_code == 201

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "new@example.com", "password": "correcthorsebattery"},
    )
    assert login.status_code == 200
    assert "access_token" in login.json()
    assert "daybook_refresh" in login.cookies


async def test_duplicate_email_rejected(client: AsyncClient) -> None:
    payload = {"email": "dupe@example.com", "password": "correcthorsebattery"}
    first = await client.post("/api/v1/auth/register", json=payload)
    second = await client.post("/api/v1/auth/register", json=payload)
    assert first.status_code == 201
    assert second.status_code == 409


async def test_wrong_password_rejected(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/auth/register", json={"email": "u@example.com", "password": "correcthorsebattery"}
    )
    resp = await client.post(
        "/api/v1/auth/login", json={"email": "u@example.com", "password": "wrong-password"}
    )
    assert resp.status_code == 401


async def test_me_requires_token(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


async def test_refresh_rotation_invalidates_old_token(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    old_refresh_token = client.cookies.get("daybook_refresh")
    assert old_refresh_token is not None

    first_refresh = await client.post("/api/v1/auth/refresh")
    assert first_refresh.status_code == 200

    # Replaying the pre-rotation token must fail — reuse of a rotated-out
    # refresh token is exactly the signal that a token has been stolen.
    client.cookies.set("daybook_refresh", old_refresh_token)
    replay = await client.post("/api/v1/auth/refresh")
    assert replay.status_code == 401
