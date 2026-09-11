from httpx import AsyncClient


async def test_habit_streak_increments_with_consecutive_days(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    create = await client.post("/api/v1/habits", headers=auth_headers, json={"name": "Read"})
    habit = create.json()
    assert habit["current_streak"] == 0

    toggle = await client.post(f"/api/v1/habits/{habit['id']}/toggle", headers=auth_headers)
    body = toggle.json()
    assert body["completed_today"] is True
    assert body["current_streak"] == 1


async def test_transaction_requires_owned_account(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    import uuid

    resp = await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": str(uuid.uuid4()), "kind": "expense", "amount": "100.00"},
    )
    assert resp.status_code == 404


async def test_finance_flow_updates_dashboard_spend(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await client.post(
        "/api/v1/finance/accounts", headers=auth_headers, json={"name": "Wallet"}
    )
    account_id = account.json()["id"]

    txn = await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account_id, "kind": "expense", "amount": "450.00", "note": "lunch"},
    )
    assert txn.status_code == 201

    dashboard = await client.get("/api/v1/dashboard/today", headers=auth_headers)
    assert dashboard.json()["finance"]["spent_today"] == 450.0


async def test_fitness_set_appears_on_reload(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    exercise = await client.post(
        "/api/v1/fitness/exercises", headers=auth_headers, json={"name": "Bench Press"}
    )
    session = await client.post(
        "/api/v1/fitness/sessions", headers=auth_headers, json={"name": "Push Day"}
    )
    session_id = session.json()["id"]

    add_set = await client.post(
        f"/api/v1/fitness/sessions/{session_id}/sets",
        headers=auth_headers,
        json={"exercise_id": exercise.json()["id"], "reps": 8, "weight_kg": "60"},
    )
    assert add_set.status_code == 200
    # Regression test: same populate_existing staleness bug as routines/habits —
    # the just-added set must appear in the response that adds it, not only on next request.
    assert len(add_set.json()["sets"]) == 1

    dashboard = await client.get("/api/v1/dashboard/today", headers=auth_headers)
    assert dashboard.json()["fitness"]["logged_today"] is True
