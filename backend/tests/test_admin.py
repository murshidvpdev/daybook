from httpx import AsyncClient


async def test_admin_login_succeeds_with_correct_credentials(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    resp = await client.get("/api/v1/admin/stats", headers=admin_headers)
    assert resp.status_code == 200


async def test_admin_login_rejects_wrong_password(client: AsyncClient, admin_headers: dict[str, str]) -> None:
    resp = await client.post(
        "/api/v1/admin/auth/login", json={"email": "admin@example.com", "password": "wrong-password"}
    )
    assert resp.status_code == 401


async def test_regular_user_token_cannot_access_admin_routes(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    resp = await client.get("/api/v1/admin/stats", headers=auth_headers)
    assert resp.status_code == 401


async def test_admin_token_cannot_access_regular_user_routes(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    resp = await client.get("/api/v1/auth/me", headers=admin_headers)
    assert resp.status_code == 401


async def test_admin_stats_reflect_real_signups(client: AsyncClient, admin_headers: dict[str, str]) -> None:
    await client.post("/api/v1/auth/register", json={"email": "one@example.com", "password": "correcthorsebattery"})
    await client.post("/api/v1/auth/register", json={"email": "two@example.com", "password": "correcthorsebattery"})

    resp = await client.get("/api/v1/admin/stats", headers=admin_headers)
    body = resp.json()
    assert body["total_users"] == 2
    assert body["new_users_today"] == 2


async def test_admin_stats_counts_active_users_by_session_activity(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    await client.post("/api/v1/auth/register", json={"email": "active@example.com", "password": "correcthorsebattery"})
    await client.post("/api/v1/auth/register", json={"email": "quiet@example.com", "password": "correcthorsebattery"})
    await client.post("/api/v1/auth/login", json={"email": "active@example.com", "password": "correcthorsebattery"})

    resp = await client.get("/api/v1/admin/stats", headers=admin_headers)
    assert resp.json()["active_users_today"] == 1


async def test_admin_lists_users_with_domain_counts(client: AsyncClient, admin_headers: dict[str, str]) -> None:
    reg = await client.post(
        "/api/v1/auth/register", json={"email": "busy@example.com", "password": "correcthorsebattery"}
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": "busy@example.com", "password": "correcthorsebattery"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    await client.post("/api/v1/habits", headers=headers, json={"name": "Read"})

    resp = await client.get("/api/v1/admin/users", headers=admin_headers)
    assert resp.status_code == 200
    by_email = {u["email"]: u for u in resp.json()}
    assert by_email["busy@example.com"]["habits_count"] == 1
    assert by_email["busy@example.com"]["id"] == reg.json()["id"]


async def test_admin_user_detail_includes_finance_and_domain_summaries(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    reg = await client.post(
        "/api/v1/auth/register", json={"email": "detail@example.com", "password": "correcthorsebattery"}
    )
    user_id = reg.json()["id"]
    login = await client.post(
        "/api/v1/auth/login", json={"email": "detail@example.com", "password": "correcthorsebattery"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    account = await client.post("/api/v1/finance/accounts", headers=headers, json={"name": "Wallet"})
    await client.post(
        "/api/v1/finance/transactions",
        headers=headers,
        json={"account_id": account.json()["id"], "kind": "expense", "amount": "100"},
    )

    resp = await client.get(f"/api/v1/admin/users/{user_id}", headers=admin_headers)
    body = resp.json()
    assert body["email"] == "detail@example.com"
    assert len(body["recent_transactions"]) == 1
    assert float(body["finance"]["spent_this_month"]) == 100.0


async def test_admin_resets_a_users_password_and_they_can_log_in_with_it(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    reg = await client.post(
        "/api/v1/auth/register", json={"email": "forgot@example.com", "password": "correcthorsebattery"}
    )
    user_id = reg.json()["id"]

    resp = await client.post(
        f"/api/v1/admin/users/{user_id}/reset-password", headers=admin_headers, json={"new_password": "newpassword123"}
    )
    assert resp.status_code == 204

    old_login = await client.post(
        "/api/v1/auth/login", json={"email": "forgot@example.com", "password": "correcthorsebattery"}
    )
    assert old_login.status_code == 401

    new_login = await client.post(
        "/api/v1/auth/login", json={"email": "forgot@example.com", "password": "newpassword123"}
    )
    assert new_login.status_code == 200


async def test_admin_deactivating_a_user_blocks_their_login(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    reg = await client.post(
        "/api/v1/auth/register", json={"email": "banned@example.com", "password": "correcthorsebattery"}
    )
    user_id = reg.json()["id"]

    resp = await client.post(
        f"/api/v1/admin/users/{user_id}/active", headers=admin_headers, json={"is_active": False}
    )
    assert resp.status_code == 204

    login = await client.post(
        "/api/v1/auth/login", json={"email": "banned@example.com", "password": "correcthorsebattery"}
    )
    assert login.status_code == 401


async def test_admin_reactivating_a_user_restores_login(client: AsyncClient, admin_headers: dict[str, str]) -> None:
    reg = await client.post(
        "/api/v1/auth/register", json={"email": "restored@example.com", "password": "correcthorsebattery"}
    )
    user_id = reg.json()["id"]
    await client.post(f"/api/v1/admin/users/{user_id}/active", headers=admin_headers, json={"is_active": False})
    await client.post(f"/api/v1/admin/users/{user_id}/active", headers=admin_headers, json={"is_active": True})

    login = await client.post(
        "/api/v1/auth/login", json={"email": "restored@example.com", "password": "correcthorsebattery"}
    )
    assert login.status_code == 200


async def test_admin_deletes_a_user(client: AsyncClient, admin_headers: dict[str, str]) -> None:
    reg = await client.post(
        "/api/v1/auth/register", json={"email": "deleteme@example.com", "password": "correcthorsebattery"}
    )
    user_id = reg.json()["id"]

    resp = await client.delete(f"/api/v1/admin/users/{user_id}", headers=admin_headers)
    assert resp.status_code == 204

    login = await client.post(
        "/api/v1/auth/login", json={"email": "deleteme@example.com", "password": "correcthorsebattery"}
    )
    assert login.status_code == 401

    detail = await client.get(f"/api/v1/admin/users/{user_id}", headers=admin_headers)
    assert detail.status_code == 404


async def test_admin_routes_require_authentication(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/admin/stats")
    assert resp.status_code == 401
