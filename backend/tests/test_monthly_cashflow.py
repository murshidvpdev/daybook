from datetime import date

from httpx import AsyncClient


async def _account(client: AsyncClient, headers: dict[str, str], name: str = "HDFC Bank") -> str:
    resp = await client.post(
        "/api/v1/finance/accounts",
        headers=headers,
        json={"name": name, "account_type": "bank", "opening_balance": "0"},
    )
    return resp.json()["id"]


async def _txn(
    client: AsyncClient, headers: dict[str, str], account_id: str, kind: str, amount: str, on: str
) -> None:
    resp = await client.post(
        "/api/v1/finance/transactions",
        headers=headers,
        json={"account_id": account_id, "kind": kind, "amount": amount, "occurred_on": on},
    )
    assert resp.status_code == 201


async def test_income_excludes_lending_and_bill_payments(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    bank = await _account(client, auth_headers)
    await _txn(client, auth_headers, bank, "income", "50000", "2026-09-01")  # salary
    await _txn(client, auth_headers, bank, "expense", "12000", "2026-09-05")  # rent

    # Borrowed 5000 into the bank — money in, but not income.
    await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={
            "person_name": "Rahul",
            "direction": "borrowed",
            "amount": "5000",
            "account_id": bank,
            "given_on": "2026-09-10",
        },
    )
    # Lent 3000 out, friend repays 1000 — neither is spending or income.
    lent = await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={
            "person_name": "Arjun",
            "direction": "lent",
            "amount": "3000",
            "account_id": bank,
            "given_on": "2026-09-12",
        },
    )
    await client.post(
        f"/api/v1/finance/lendings/{lent.json()['id']}/payments",
        headers=auth_headers,
        json={"amount": "1000", "paid_on": "2026-09-20", "account_id": bank},
    )

    resp = await client.get(
        "/api/v1/finance/analytics/monthly-cashflow?year=2026&month=9&months=1", headers=auth_headers
    )
    assert resp.status_code == 200
    [sept] = resp.json()
    assert (sept["year"], sept["month"]) == (2026, 9)
    assert float(sept["income"]) == 50000.0
    assert float(sept["spent"]) == 12000.0
    assert float(sept["saved"]) == 38000.0
    assert sept["savings_rate"] == 76.0
    assert float(sept["lending_in"]) == 6000.0
    assert float(sept["lending_out"]) == 3000.0


async def test_card_bill_payment_is_not_income(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await client.post(
        "/api/v1/finance/credit-cards",
        headers=auth_headers,
        json={"name": "HDFC Regalia", "due_day": 5},
    )
    card_body = card.json()
    await client.post(
        f"/api/v1/finance/credit-cards/{card_body['id']}/spend", headers=auth_headers, json={"amount": "2000"}
    )
    bill = await client.post(f"/api/v1/finance/credit-cards/{card_body['id']}/bills", headers=auth_headers)
    await client.post(f"/api/v1/finance/credit-cards/bills/{bill.json()['id']}/pay", headers=auth_headers)

    resp = await client.get("/api/v1/finance/analytics/monthly-cashflow?months=1", headers=auth_headers)
    [this_month] = resp.json()
    assert float(this_month["income"]) == 0.0
    assert float(this_month["spent"]) == 2000.0
    assert float(this_month["saved"]) == -2000.0
    assert this_month["savings_rate"] is None


async def test_returns_zero_filled_months_oldest_first(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    bank = await _account(client, auth_headers)
    await _txn(client, auth_headers, bank, "income", "40000", "2026-07-01")
    await _txn(client, auth_headers, bank, "expense", "1000", "2025-12-15")

    resp = await client.get(
        "/api/v1/finance/analytics/monthly-cashflow?year=2026&month=2&months=3", headers=auth_headers
    )
    body = resp.json()
    assert [(m["year"], m["month"]) for m in body] == [(2025, 12), (2026, 1), (2026, 2)]
    assert float(body[0]["spent"]) == 1000.0
    assert all(float(m["income"]) == 0.0 for m in body)


async def test_monthly_cashflow_is_per_user(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    bank = await _account(client, auth_headers)
    await _txn(client, auth_headers, bank, "income", "40000", date.today().isoformat())

    await client.post(
        "/api/v1/auth/register", json={"email": "eve-cashflow@example.com", "password": "correcthorsebattery"}
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": "eve-cashflow@example.com", "password": "correcthorsebattery"}
    )
    eve_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    resp = await client.get("/api/v1/finance/analytics/monthly-cashflow?months=1", headers=eve_headers)
    assert float(resp.json()[0]["income"]) == 0.0
