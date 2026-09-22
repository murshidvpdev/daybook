from httpx import AsyncClient

REPORT_DATE = "2026-03-15"


async def _other_user_headers(client: AsyncClient, email: str) -> dict[str, str]:
    await client.post("/api/v1/auth/register", json={"email": email, "password": "correcthorsebattery"})
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "correcthorsebattery"})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _seed_day(client: AsyncClient, headers: dict[str, str]) -> None:
    account = await client.post(
        "/api/v1/finance/accounts", headers=headers, json={"name": "Wallet", "opening_balance": "1000"}
    )
    account_id = account.json()["id"]
    await client.post(
        "/api/v1/finance/transactions",
        headers=headers,
        json={
            "account_id": account_id,
            "kind": "expense",
            "amount": "250",
            "note": "Lunch",
            "occurred_on": REPORT_DATE,
        },
    )

    routine = await client.post(
        "/api/v1/routines", headers=headers, json={"name": "Morning", "items": [{"title": "Meditate"}]}
    )
    routine_body = routine.json()
    await client.post(
        f"/api/v1/routines/{routine_body['id']}/items/{routine_body['items'][0]['id']}/toggle",
        headers=headers,
        params={"on": REPORT_DATE},
    )

    habit = await client.post("/api/v1/habits", headers=headers, json={"name": "Read"})
    await client.post(f"/api/v1/habits/{habit.json()['id']}/toggle", headers=headers, params={"on": REPORT_DATE})

    exercise = await client.post("/api/v1/fitness/exercises", headers=headers, json={"name": "Push-ups"})
    session = await client.post(
        "/api/v1/fitness/sessions",
        headers=headers,
        json={"name": "Home Workout", "performed_on": REPORT_DATE, "duration_minutes": 20},
    )
    await client.post(
        f"/api/v1/fitness/sessions/{session.json()['id']}/sets",
        headers=headers,
        json={"exercise_id": exercise.json()["id"], "reps": 15},
    )

    await client.post(
        "/api/v1/finance/lendings",
        headers=headers,
        json={"person_name": "Arjun", "direction": "lent", "amount": "500", "given_on": REPORT_DATE},
    )


async def test_day_report_aggregates_every_domain(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await _seed_day(client, auth_headers)

    resp = await client.get(f"/api/v1/reports/day/{REPORT_DATE}", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()

    assert body["report_date"] == REPORT_DATE
    assert body["routine_items_done"] == [{"routine_name": "Morning", "item_title": "Meditate"}]
    assert body["routine_items_total"] == 1
    assert body["habits_done"] == [{"name": "Read"}]
    assert body["habits_total"] == 1
    assert len(body["transactions"]) == 1
    assert body["transactions"][0]["note"] == "Lunch"
    assert float(body["total_spent"]) == 250.0
    assert float(body["total_income"]) == 0.0
    assert len(body["workouts"]) == 1
    assert body["workouts"][0]["name"] == "Home Workout"
    assert len(body["workouts"][0]["sets"]) == 1
    assert len(body["lendings"]) == 1
    assert body["lendings"][0]["person_name"] == "Arjun"


async def test_day_report_empty_day_has_zeroed_out_fields(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    resp = await client.get("/api/v1/reports/day/2020-01-01", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["routine_items_done"] == []
    assert body["habits_done"] == []
    assert body["transactions"] == []
    assert body["workouts"] == []
    assert body["lendings"] == []
    assert float(body["total_spent"]) == 0.0


async def test_day_report_only_shows_own_data(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await _seed_day(client, auth_headers)
    eve_headers = await _other_user_headers(client, "day-report-eve@example.com")

    resp = await client.get(f"/api/v1/reports/day/{REPORT_DATE}", headers=eve_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["routine_items_done"] == []
    assert body["transactions"] == []


async def test_day_report_pdf_downloads_with_correct_headers(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await _seed_day(client, auth_headers)

    resp = await client.get(f"/api/v1/reports/day/{REPORT_DATE}/pdf", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert f'daybook-{REPORT_DATE}.pdf' in resp.headers["content-disposition"]
    # A real PDF, not an empty/broken stub.
    assert resp.content.startswith(b"%PDF")
    assert len(resp.content) > 2000


async def test_day_report_pdf_requires_auth(client: AsyncClient) -> None:
    resp = await client.get(f"/api/v1/reports/day/{REPORT_DATE}/pdf")
    assert resp.status_code == 401
