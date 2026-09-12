from httpx import AsyncClient


async def _other_user_headers(client: AsyncClient, email: str) -> dict[str, str]:
    await client.post("/api/v1/auth/register", json={"email": email, "password": "correcthorsebattery"})
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "correcthorsebattery"})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


# --- Routines -----------------------------------------------------------------


async def test_update_routine_fields(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post(
        "/api/v1/routines", headers=auth_headers, json={"name": "Morning", "items": [{"title": "Meditate"}]}
    )
    routine_id = create.json()["id"]

    resp = await client.patch(
        f"/api/v1/routines/{routine_id}",
        headers=auth_headers,
        json={"name": "Evening", "time_of_day": "evening"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Evening"
    assert body["time_of_day"] == "evening"


async def test_update_routine_rejects_other_users_routine(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post("/api/v1/routines", headers=auth_headers, json={"name": "Private", "items": []})
    routine_id = create.json()["id"]
    eve_headers = await _other_user_headers(client, "update-routine-eve@example.com")
    resp = await client.patch(f"/api/v1/routines/{routine_id}", headers=eve_headers, json={"name": "Hijacked"})
    assert resp.status_code == 404


async def test_add_update_delete_routine_item(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post("/api/v1/routines", headers=auth_headers, json={"name": "Morning", "items": []})
    routine_id = create.json()["id"]

    added = await client.post(
        f"/api/v1/routines/{routine_id}/items", headers=auth_headers, json={"title": "Stretch", "sort_order": 1}
    )
    assert added.status_code == 201
    items = added.json()["items"]
    assert len(items) == 1
    item_id = items[0]["id"]
    assert items[0]["title"] == "Stretch"

    updated = await client.patch(
        f"/api/v1/routines/{routine_id}/items/{item_id}",
        headers=auth_headers,
        json={"title": "Deep Stretch"},
    )
    assert updated.status_code == 200
    assert updated.json()["items"][0]["title"] == "Deep Stretch"

    deleted = await client.delete(f"/api/v1/routines/{routine_id}/items/{item_id}", headers=auth_headers)
    assert deleted.status_code == 200
    assert deleted.json()["items"] == []


async def test_update_delete_routine_item_rejects_other_users_routine(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/api/v1/routines", headers=auth_headers, json={"name": "Private", "items": [{"title": "X"}]}
    )
    routine = create.json()
    item_id = routine["items"][0]["id"]
    eve_headers = await _other_user_headers(client, "update-item-eve@example.com")

    update_resp = await client.patch(
        f"/api/v1/routines/{routine['id']}/items/{item_id}", headers=eve_headers, json={"title": "Hijacked"}
    )
    assert update_resp.status_code == 404

    delete_resp = await client.delete(f"/api/v1/routines/{routine['id']}/items/{item_id}", headers=eve_headers)
    assert delete_resp.status_code == 404


# --- Habits -----------------------------------------------------------------


async def test_update_habit_fields(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post("/api/v1/habits", headers=auth_headers, json={"name": "Read"})
    habit_id = create.json()["id"]

    resp = await client.patch(
        f"/api/v1/habits/{habit_id}", headers=auth_headers, json={"name": "Read Fiction", "cadence": "weekly"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Read Fiction"
    assert body["cadence"] == "weekly"


async def test_unarchive_habit_via_update(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post("/api/v1/habits", headers=auth_headers, json={"name": "Meditate"})
    habit_id = create.json()["id"]

    await client.delete(f"/api/v1/habits/{habit_id}", headers=auth_headers)

    listed = await client.get("/api/v1/habits", headers=auth_headers)
    assert all(h["id"] != habit_id for h in listed.json())

    listed_with_archived = await client.get(
        "/api/v1/habits", headers=auth_headers, params={"include_archived": True}
    )
    archived_habit = next(h for h in listed_with_archived.json() if h["id"] == habit_id)
    assert archived_habit["is_archived"] is True

    unarchive = await client.patch(
        f"/api/v1/habits/{habit_id}", headers=auth_headers, json={"is_archived": False}
    )
    assert unarchive.status_code == 200
    assert unarchive.json()["is_archived"] is False

    listed_again = await client.get("/api/v1/habits", headers=auth_headers)
    assert any(h["id"] == habit_id for h in listed_again.json())


async def test_update_habit_rejects_other_users_habit(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post("/api/v1/habits", headers=auth_headers, json={"name": "Private"})
    habit_id = create.json()["id"]
    eve_headers = await _other_user_headers(client, "update-habit-eve@example.com")
    resp = await client.patch(f"/api/v1/habits/{habit_id}", headers=eve_headers, json={"name": "Hijacked"})
    assert resp.status_code == 404


# --- Fitness -----------------------------------------------------------------


async def test_update_and_delete_exercise(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post(
        "/api/v1/fitness/exercises", headers=auth_headers, json={"name": "Bench Press"}
    )
    exercise_id = create.json()["id"]

    updated = await client.patch(
        f"/api/v1/fitness/exercises/{exercise_id}",
        headers=auth_headers,
        json={"name": "Incline Bench Press", "muscle_group": "chest"},
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["name"] == "Incline Bench Press"
    assert body["muscle_group"] == "chest"

    deleted = await client.delete(f"/api/v1/fitness/exercises/{exercise_id}", headers=auth_headers)
    assert deleted.status_code == 204

    listed = await client.get("/api/v1/fitness/exercises", headers=auth_headers)
    assert all(e["id"] != exercise_id for e in listed.json())


async def test_update_exercise_rejects_other_users_exercise(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post("/api/v1/fitness/exercises", headers=auth_headers, json={"name": "Squat"})
    exercise_id = create.json()["id"]
    eve_headers = await _other_user_headers(client, "update-exercise-eve@example.com")
    resp = await client.patch(
        f"/api/v1/fitness/exercises/{exercise_id}", headers=eve_headers, json={"name": "Hijacked"}
    )
    assert resp.status_code == 404


async def test_update_and_delete_session(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post(
        "/api/v1/fitness/sessions", headers=auth_headers, json={"name": "Push Day"}
    )
    session_id = create.json()["id"]

    updated = await client.patch(
        f"/api/v1/fitness/sessions/{session_id}",
        headers=auth_headers,
        json={"name": "Pull Day", "duration_minutes": 45, "notes": "felt good"},
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["name"] == "Pull Day"
    assert body["duration_minutes"] == 45
    assert body["notes"] == "felt good"

    deleted = await client.delete(f"/api/v1/fitness/sessions/{session_id}", headers=auth_headers)
    assert deleted.status_code == 204

    listed = await client.get("/api/v1/fitness/sessions", headers=auth_headers)
    assert all(s["id"] != session_id for s in listed.json())


async def test_update_session_rejects_other_users_session(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post("/api/v1/fitness/sessions", headers=auth_headers, json={"name": "Leg Day"})
    session_id = create.json()["id"]
    eve_headers = await _other_user_headers(client, "update-session-eve@example.com")
    resp = await client.patch(
        f"/api/v1/fitness/sessions/{session_id}", headers=eve_headers, json={"name": "Hijacked"}
    )
    assert resp.status_code == 404


async def test_update_and_delete_exercise_set(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    exercise = await client.post(
        "/api/v1/fitness/exercises", headers=auth_headers, json={"name": "Deadlift"}
    )
    session = await client.post("/api/v1/fitness/sessions", headers=auth_headers, json={"name": "Pull Day"})
    session_id = session.json()["id"]

    added = await client.post(
        f"/api/v1/fitness/sessions/{session_id}/sets",
        headers=auth_headers,
        json={"exercise_id": exercise.json()["id"], "reps": 5, "weight_kg": "100"},
    )
    set_id = added.json()["sets"][0]["id"]

    updated = await client.patch(
        f"/api/v1/fitness/sessions/{session_id}/sets/{set_id}",
        headers=auth_headers,
        json={"reps": 8, "weight_kg": "110"},
    )
    assert updated.status_code == 200
    updated_set = next(s for s in updated.json()["sets"] if s["id"] == set_id)
    assert updated_set["reps"] == 8
    assert float(updated_set["weight_kg"]) == 110.0

    deleted = await client.delete(
        f"/api/v1/fitness/sessions/{session_id}/sets/{set_id}", headers=auth_headers
    )
    assert deleted.status_code == 200
    assert deleted.json()["sets"] == []


async def test_update_delete_set_rejects_other_users_session(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    exercise = await client.post("/api/v1/fitness/exercises", headers=auth_headers, json={"name": "Row"})
    session = await client.post("/api/v1/fitness/sessions", headers=auth_headers, json={"name": "Back Day"})
    session_id = session.json()["id"]
    added = await client.post(
        f"/api/v1/fitness/sessions/{session_id}/sets",
        headers=auth_headers,
        json={"exercise_id": exercise.json()["id"], "reps": 10},
    )
    set_id = added.json()["sets"][0]["id"]

    eve_headers = await _other_user_headers(client, "update-set-eve@example.com")
    update_resp = await client.patch(
        f"/api/v1/fitness/sessions/{session_id}/sets/{set_id}", headers=eve_headers, json={"reps": 1}
    )
    assert update_resp.status_code == 404

    delete_resp = await client.delete(
        f"/api/v1/fitness/sessions/{session_id}/sets/{set_id}", headers=eve_headers
    )
    assert delete_resp.status_code == 404
