from httpx import AsyncClient


async def _seed_month(client: AsyncClient, headers: dict[str, str], month: str) -> None:
    account = await client.post(
        "/api/v1/finance/accounts", headers=headers, json={"name": "Wallet", "opening_balance": "1000"}
    )
    account_id = account.json()["id"]
    await client.post(
        "/api/v1/finance/transactions",
        headers=headers,
        json={"account_id": account_id, "kind": "expense", "amount": "300", "occurred_on": f"{month}-05"},
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=headers,
        json={"account_id": account_id, "kind": "income", "amount": "1000", "occurred_on": f"{month}-10"},
    )

    routine = await client.post(
        "/api/v1/routines", headers=headers, json={"name": "Morning", "items": [{"title": "Meditate"}]}
    )
    item_id = routine.json()["items"][0]["id"]
    await client.post(
        f"/api/v1/routines/{routine.json()['id']}/items/{item_id}/toggle",
        headers=headers,
        params={"on": f"{month}-05"},
    )

    habit = await client.post("/api/v1/habits", headers=headers, json={"name": "Read"})
    await client.post(f"/api/v1/habits/{habit.json()['id']}/toggle", headers=headers, params={"on": f"{month}-05"})

    exercise = await client.post("/api/v1/fitness/exercises", headers=headers, json={"name": "Push-ups"})
    session = await client.post(
        "/api/v1/fitness/sessions",
        headers=headers,
        json={"name": "Workout", "performed_on": f"{month}-05"},
    )
    await client.post(
        f"/api/v1/fitness/sessions/{session.json()['id']}/sets",
        headers=headers,
        json={"exercise_id": exercise.json()["id"], "reps": 10},
    )

    await client.post(
        "/api/v1/finance/lendings",
        headers=headers,
        json={"person_name": "Arjun", "direction": "lent", "amount": "500", "given_on": f"{month}-05"},
    )


async def test_month_report_aggregates_every_domain(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await _seed_month(client, auth_headers, "2026-03")

    resp = await client.get("/api/v1/reports/month/2026/3", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()

    assert body["label"] == "March 2026"
    assert body["start_date"] == "2026-03-01"
    assert body["end_date"] == "2026-03-31"
    assert body["routine_completions"] == 1
    assert body["habits_completed"] == 1
    assert body["transactions_count"] == 2
    assert float(body["total_spent"]) == 300.0
    assert float(body["total_income"]) == 1000.0
    assert float(body["net"]) == 700.0
    assert body["workouts_count"] == 1
    assert body["total_sets"] == 1
    assert float(body["lending_given"]) == 500.0


async def test_month_report_excludes_other_months(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await _seed_month(client, auth_headers, "2026-03")

    resp = await client.get("/api/v1/reports/month/2026/4", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["transactions_count"] == 0
    assert float(body["total_spent"]) == 0.0
    assert body["routine_completions"] == 0


async def test_month_report_rejects_invalid_month(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    resp = await client.get("/api/v1/reports/month/2026/13", headers=auth_headers)
    assert resp.status_code == 422


async def test_month_report_pdf_downloads(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await _seed_month(client, auth_headers, "2026-03")
    resp = await client.get("/api/v1/reports/month/2026/3/pdf", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "daybook-2026-03.pdf" in resp.headers["content-disposition"]
    assert resp.content.startswith(b"%PDF")


async def test_all_time_report_spans_every_month(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await _seed_month(client, auth_headers, "2026-01")
    await _seed_month(client, auth_headers, "2026-06")

    resp = await client.get("/api/v1/reports/all", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["label"] == "All time"
    assert body["start_date"] is None
    assert body["end_date"] is None
    assert body["transactions_count"] == 4
    assert float(body["total_spent"]) == 600.0
    assert float(body["total_income"]) == 2000.0
    assert body["routine_completions"] == 2


async def test_all_time_report_pdf_downloads(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    resp = await client.get("/api/v1/reports/all/pdf", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")


async def test_month_report_only_includes_own_data(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await _seed_month(client, auth_headers, "2026-03")

    await client.post(
        "/api/v1/auth/register", json={"email": "month-report-eve@example.com", "password": "correcthorsebattery"}
    )
    eve_login = await client.post(
        "/api/v1/auth/login", json={"email": "month-report-eve@example.com", "password": "correcthorsebattery"}
    )
    eve_headers = {"Authorization": f"Bearer {eve_login.json()['access_token']}"}

    resp = await client.get("/api/v1/reports/month/2026/3", headers=eve_headers)
    assert resp.status_code == 200
    assert resp.json()["transactions_count"] == 0
