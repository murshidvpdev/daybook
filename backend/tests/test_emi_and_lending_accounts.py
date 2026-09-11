from httpx import AsyncClient


async def test_emi_can_debit_a_bank_account_not_just_a_credit_card(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    account = await client.post(
        "/api/v1/finance/accounts", headers=auth_headers, json={"name": "HDFC Bank", "account_type": "bank"}
    )
    account_id = account.json()["id"]

    create = await client.post(
        "/api/v1/finance/emis",
        headers=auth_headers,
        json={
            "account_id": account_id,
            "name": "Personal Loan",
            "monthly_amount": "4000",
            "total_installments": 24,
            "due_day": 5,
        },
    )
    assert create.status_code == 201
    assert create.json()["account_id"] == account_id


async def test_emi_rejects_another_users_account(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await client.post("/api/v1/auth/register", json={"email": "emi-eve@example.com", "password": "correcthorsebattery"})
    eve_login = await client.post(
        "/api/v1/auth/login", json={"email": "emi-eve@example.com", "password": "correcthorsebattery"}
    )
    eve_headers = {"Authorization": f"Bearer {eve_login.json()['access_token']}"}
    eve_account = await client.post(
        "/api/v1/finance/accounts", headers=eve_headers, json={"name": "Eve's Bank", "account_type": "bank"}
    )

    resp = await client.post(
        "/api/v1/finance/emis",
        headers=auth_headers,
        json={
            "account_id": eve_account.json()["id"],
            "name": "Loan",
            "monthly_amount": "1000",
            "total_installments": 12,
            "due_day": 5,
        },
    )
    assert resp.status_code == 404


async def test_lending_with_account_creates_linked_expense_and_updates_balance(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    account = await client.post(
        "/api/v1/finance/accounts",
        headers=auth_headers,
        json={"name": "Wallet", "account_type": "cash", "opening_balance": "5000"},
    )
    account_id = account.json()["id"]

    lending = await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Arjun", "direction": "lent", "amount": "2000", "account_id": account_id},
    )
    assert lending.status_code == 201
    body = lending.json()
    assert body["transaction_id"] is not None

    accounts = await client.get("/api/v1/finance/accounts", headers=auth_headers)
    updated = next(a for a in accounts.json() if a["id"] == account_id)
    assert float(updated["current_balance"]) == 3000.0

    txns = await client.get("/api/v1/finance/transactions", headers=auth_headers)
    txn = next(t for t in txns.json() if t["id"] == body["transaction_id"])
    assert txn["kind"] == "expense"
    assert float(txn["amount"]) == 2000.0


async def test_borrowed_money_with_account_is_income_not_expense(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    account = await client.post(
        "/api/v1/finance/accounts",
        headers=auth_headers,
        json={"name": "Wallet", "account_type": "cash", "opening_balance": "5000"},
    )
    account_id = account.json()["id"]

    await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Priya", "direction": "borrowed", "amount": "1000", "account_id": account_id},
    )

    accounts = await client.get("/api/v1/finance/accounts", headers=auth_headers)
    updated = next(a for a in accounts.json() if a["id"] == account_id)
    assert float(updated["current_balance"]) == 6000.0


async def test_lending_without_account_has_no_financial_effect(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    lending = await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Arjun", "direction": "lent", "amount": "2000"},
    )
    assert lending.status_code == 201
    assert lending.json()["transaction_id"] is None

    txns = await client.get("/api/v1/finance/transactions", headers=auth_headers)
    assert txns.json() == []


async def test_lending_rejects_another_users_account(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await client.post("/api/v1/auth/register", json={"email": "lend-eve@example.com", "password": "correcthorsebattery"})
    eve_login = await client.post(
        "/api/v1/auth/login", json={"email": "lend-eve@example.com", "password": "correcthorsebattery"}
    )
    eve_headers = {"Authorization": f"Bearer {eve_login.json()['access_token']}"}
    eve_account = await client.post(
        "/api/v1/finance/accounts", headers=eve_headers, json={"name": "Eve's Wallet", "account_type": "cash"}
    )

    resp = await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={
            "person_name": "Arjun",
            "direction": "lent",
            "amount": "2000",
            "account_id": eve_account.json()["id"],
        },
    )
    assert resp.status_code == 404
