from httpx import AsyncClient


async def test_login_is_rate_limited_after_repeated_attempts(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/auth/register", json={"email": "ratelimit@example.com", "password": "correcthorsebattery"}
    )

    responses = [
        await client.post(
            "/api/v1/auth/login", json={"email": "ratelimit@example.com", "password": "wrong-password"}
        )
        for _ in range(11)
    ]

    assert all(r.status_code == 401 for r in responses[:10])
    assert responses[10].status_code == 429


async def test_register_is_rate_limited_after_repeated_attempts(client: AsyncClient) -> None:
    responses = [
        await client.post(
            "/api/v1/auth/register", json={"email": f"burst{i}@example.com", "password": "correcthorsebattery"}
        )
        for i in range(6)
    ]

    assert all(r.status_code == 201 for r in responses[:5])
    assert responses[5].status_code == 429
