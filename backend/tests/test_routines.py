from httpx import AsyncClient


async def test_create_and_toggle_routine_item(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post(
        "/api/v1/routines",
        headers=auth_headers,
        json={"name": "Morning", "items": [{"title": "Meditate"}]},
    )
    assert create.status_code == 201
    routine = create.json()
    item_id = routine["items"][0]["id"]
    assert routine["items"][0]["completed_today"] is False

    # Regression test: the toggle response must reflect the write it just made,
    # not a stale in-memory copy of the parent's relationship collection.
    toggle = await client.post(
        f"/api/v1/routines/{routine['id']}/items/{item_id}/toggle", headers=auth_headers
    )
    assert toggle.status_code == 200
    assert toggle.json()["items"][0]["completed_today"] is True

    # Toggling again un-marks it for the day.
    toggle_again = await client.post(
        f"/api/v1/routines/{routine['id']}/items/{item_id}/toggle", headers=auth_headers
    )
    assert toggle_again.json()["items"][0]["completed_today"] is False


async def test_dashboard_reflects_routine_completion(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post(
        "/api/v1/routines",
        headers=auth_headers,
        json={"name": "Morning", "items": [{"title": "A"}, {"title": "B"}]},
    )
    routine = create.json()
    await client.post(
        f"/api/v1/routines/{routine['id']}/items/{routine['items'][0]['id']}/toggle",
        headers=auth_headers,
    )

    dashboard = await client.get("/api/v1/dashboard/today", headers=auth_headers)
    body = dashboard.json()
    assert body["routines"] == {"completed": 1, "total": 2}


async def test_cannot_access_another_users_routine(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post(
        "/api/v1/routines", headers=auth_headers, json={"name": "Private", "items": [{"title": "X"}]}
    )
    routine = create.json()
    item_id = routine["items"][0]["id"]

    await client.post("/api/v1/auth/register", json={"email": "eve@example.com", "password": "correcthorsebattery"})
    eve_login = await client.post(
        "/api/v1/auth/login", json={"email": "eve@example.com", "password": "correcthorsebattery"}
    )
    eve_headers = {"Authorization": f"Bearer {eve_login.json()['access_token']}"}

    listed = await client.get("/api/v1/routines", headers=eve_headers)
    assert listed.json() == []

    forbidden = await client.post(
        f"/api/v1/routines/{routine['id']}/items/{item_id}/toggle", headers=eve_headers
    )
    assert forbidden.status_code == 404

    forbidden_delete = await client.delete(f"/api/v1/routines/{routine['id']}", headers=eve_headers)
    assert forbidden_delete.status_code == 404
