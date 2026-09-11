from datetime import date, timedelta

from httpx import AsyncClient


async def _create_credit_card(client: AsyncClient, headers: dict[str, str], **overrides) -> dict:
    payload = {"name": "HDFC Regalia", "last_four": "4242", "credit_limit": "150000", "due_day": 5}
    payload.update(overrides)
    resp = await client.post("/api/v1/finance/credit-cards", headers=headers, json=payload)
    assert resp.status_code == 201
    return resp.json()


async def test_account_opening_balance_reflected_in_current_balance(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/api/v1/finance/accounts",
        headers=auth_headers,
        json={"name": "HDFC Bank", "account_type": "bank", "opening_balance": "45000"},
    )
    account = create.json()
    assert account["current_balance"] == "45000.00" or float(account["current_balance"]) == 45000.0

    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "kind": "expense", "amount": "1000"},
    )
    listed = await client.get("/api/v1/finance/accounts", headers=auth_headers)
    updated = next(a for a in listed.json() if a["id"] == account["id"])
    assert float(updated["current_balance"]) == 44000.0


async def test_credit_card_spend_with_lend_creates_linked_lending(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await _create_credit_card(client, auth_headers)

    resp = await client.post(
        f"/api/v1/finance/credit-cards/{card['id']}/spend",
        headers=auth_headers,
        json={
            "amount": "2000",
            "note": "Cash for Arjun",
            "lend": {"person_name": "Arjun", "phone_number": "9876543210"},
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["lending"] is not None
    assert body["lending"]["person_name"] == "Arjun"
    assert body["lending"]["transaction_id"] == body["transaction"]["id"]

    lendings = await client.get("/api/v1/finance/lendings", headers=auth_headers)
    assert any(lend["transaction_id"] == body["transaction"]["id"] for lend in lendings.json())

    cards = await client.get("/api/v1/finance/credit-cards", headers=auth_headers)
    assert float(cards.json()[0]["outstanding_balance"]) == 2000.0


async def test_credit_card_spend_without_lend_has_no_lending(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await _create_credit_card(client, auth_headers)
    resp = await client.post(
        f"/api/v1/finance/credit-cards/{card['id']}/spend",
        headers=auth_headers,
        json={"amount": "500", "note": "Groceries"},
    )
    assert resp.status_code == 201
    assert resp.json()["lending"] is None


async def test_generate_bill_covers_transactions_since_last_bill_and_pay_reduces_balance(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await _create_credit_card(client, auth_headers)

    await client.post(
        f"/api/v1/finance/credit-cards/{card['id']}/spend",
        headers=auth_headers,
        json={"amount": "1500", "note": "Groceries"},
    )

    bill = await client.post(f"/api/v1/finance/credit-cards/{card['id']}/bills", headers=auth_headers)
    assert bill.status_code == 201
    bill_body = bill.json()
    assert float(bill_body["amount"]) == 1500.0
    assert bill_body["is_paid"] is False

    # Generating again immediately (same day, nothing new charged) should fail —
    # the new period would start after today.
    again = await client.post(f"/api/v1/finance/credit-cards/{card['id']}/bills", headers=auth_headers)
    assert again.status_code == 400

    pay = await client.post(f"/api/v1/finance/credit-cards/bills/{bill_body['id']}/pay", headers=auth_headers)
    assert pay.status_code == 200
    assert pay.json()["is_paid"] is True

    cards = await client.get("/api/v1/finance/credit-cards", headers=auth_headers)
    assert float(cards.json()[0]["outstanding_balance"]) == 0.0


async def test_generate_bill_includes_opening_balance_only_on_first_bill(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await _create_credit_card(client, auth_headers, opening_balance="1000")
    bill = await client.post(f"/api/v1/finance/credit-cards/{card['id']}/bills", headers=auth_headers)
    assert float(bill.json()["amount"]) == 1000.0


async def test_bills_are_owned_per_user(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _create_credit_card(client, auth_headers)
    await client.post(f"/api/v1/finance/credit-cards/{card['id']}/bills", headers=auth_headers)

    await client.post("/api/v1/auth/register", json={"email": "eve3@example.com", "password": "correcthorsebattery"})
    eve_login = await client.post(
        "/api/v1/auth/login", json={"email": "eve3@example.com", "password": "correcthorsebattery"}
    )
    eve_headers = {"Authorization": f"Bearer {eve_login.json()['access_token']}"}

    forbidden = await client.get(f"/api/v1/finance/credit-cards/{card['id']}/bills", headers=eve_headers)
    assert forbidden.status_code == 404


async def test_spend_trend_returns_a_zero_filled_series(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await client.post(
        "/api/v1/finance/accounts", headers=auth_headers, json={"name": "Wallet", "account_type": "cash"}
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account.json()["id"], "kind": "expense", "amount": "300"},
    )
    resp = await client.get("/api/v1/finance/analytics/spend-trend?days=7", headers=auth_headers)
    assert resp.status_code == 200
    points = resp.json()
    assert len(points) == 7
    assert points[-1]["date"] == date.today().isoformat()
    assert float(points[-1]["total"]) == 300.0
    assert float(points[0]["total"]) == 0.0


async def test_category_breakdown_groups_uncategorized(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await client.post(
        "/api/v1/finance/accounts", headers=auth_headers, json={"name": "Wallet", "account_type": "cash"}
    )
    account_id = account.json()["id"]
    category = await client.post(
        "/api/v1/finance/categories", headers=auth_headers, json={"name": "Groceries", "kind": "expense"}
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account_id, "kind": "expense", "amount": "200", "category_id": category.json()["id"]},
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account_id, "kind": "expense", "amount": "100"},
    )
    resp = await client.get("/api/v1/finance/analytics/category-breakdown", headers=auth_headers)
    breakdown = {row["category_name"]: float(row["total"]) for row in resp.json()}
    assert breakdown["Groceries"] == 200.0
    assert breakdown["Uncategorized"] == 100.0


async def test_spend_trend_ignores_dates_before_window(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await client.post(
        "/api/v1/finance/accounts", headers=auth_headers, json={"name": "Wallet", "account_type": "cash"}
    )
    old_date = (date.today() - timedelta(days=60)).isoformat()
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account.json()["id"], "kind": "expense", "amount": "999", "occurred_on": old_date},
    )
    resp = await client.get("/api/v1/finance/analytics/spend-trend?days=30", headers=auth_headers)
    assert all(float(p["total"]) == 0.0 for p in resp.json())
