from httpx import AsyncClient


async def _create_routine(client: AsyncClient, headers: dict[str, str]) -> dict:
    resp = await client.post(
        "/api/v1/routines", headers=headers, json={"name": "Morning", "items": [{"title": "Meditate"}]}
    )
    assert resp.status_code == 201
    return resp.json()


async def test_toggle_defaults_to_current_time(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    routine = await _create_routine(client, auth_headers)
    item_id = routine["items"][0]["id"]

    resp = await client.post(f"/api/v1/routines/{routine['id']}/items/{item_id}/toggle", headers=auth_headers)
    assert resp.status_code == 200
    item = resp.json()["items"][0]
    assert item["completed_today"] is True
    assert item["completed_at"] is not None


async def test_toggle_accepts_a_custom_time(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    routine = await _create_routine(client, auth_headers)
    item_id = routine["items"][0]["id"]

    resp = await client.post(
        f"/api/v1/routines/{routine['id']}/items/{item_id}/toggle",
        headers=auth_headers,
        params={"at": "09:15:00"},
    )
    item = resp.json()["items"][0]
    assert item["completed_at"] == "09:15:00"


async def test_untoggling_clears_completed_at(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    routine = await _create_routine(client, auth_headers)
    item_id = routine["items"][0]["id"]

    await client.post(f"/api/v1/routines/{routine['id']}/items/{item_id}/toggle", headers=auth_headers)
    resp = await client.post(f"/api/v1/routines/{routine['id']}/items/{item_id}/toggle", headers=auth_headers)
    item = resp.json()["items"][0]
    assert item["completed_today"] is False
    assert item["completed_at"] is None


async def test_update_completion_time_corrects_an_already_completed_item(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    routine = await _create_routine(client, auth_headers)
    item_id = routine["items"][0]["id"]

    await client.post(
        f"/api/v1/routines/{routine['id']}/items/{item_id}/toggle",
        headers=auth_headers,
        params={"at": "23:00:00"},
    )

    resp = await client.patch(
        f"/api/v1/routines/{routine['id']}/items/{item_id}/completion-time",
        headers=auth_headers,
        json={"completed_at": "07:30:00"},
    )
    assert resp.status_code == 200
    item = resp.json()["items"][0]
    assert item["completed_at"] == "07:30:00"
    assert item["completed_today"] is True  # correcting the time doesn't un-complete it


async def test_update_completion_time_rejects_uncompleted_item(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    routine = await _create_routine(client, auth_headers)
    item_id = routine["items"][0]["id"]

    resp = await client.patch(
        f"/api/v1/routines/{routine['id']}/items/{item_id}/completion-time",
        headers=auth_headers,
        json={"completed_at": "07:30:00"},
    )
    assert resp.status_code == 404


async def test_update_completion_time_rejects_other_users_routine(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    routine = await _create_routine(client, auth_headers)
    item_id = routine["items"][0]["id"]
    await client.post(f"/api/v1/routines/{routine['id']}/items/{item_id}/toggle", headers=auth_headers)

    await client.post(
        "/api/v1/auth/register", json={"email": "routine-time-eve@example.com", "password": "correcthorsebattery"}
    )
    eve_login = await client.post(
        "/api/v1/auth/login", json={"email": "routine-time-eve@example.com", "password": "correcthorsebattery"}
    )
    eve_headers = {"Authorization": f"Bearer {eve_login.json()['access_token']}"}

    resp = await client.patch(
        f"/api/v1/routines/{routine['id']}/items/{item_id}/completion-time",
        headers=eve_headers,
        json={"completed_at": "07:30:00"},
    )
    assert resp.status_code == 404
