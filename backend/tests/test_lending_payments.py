from httpx import AsyncClient


async def _other_user_headers(client: AsyncClient, email: str) -> dict[str, str]:
    await client.post("/api/v1/auth/register", json={"email": email, "password": "correcthorsebattery"})
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "correcthorsebattery"})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _create_account(client: AsyncClient, headers: dict[str, str], **overrides) -> dict:
    payload = {"name": "Bank", "account_type": "bank", "opening_balance": "1000"}
    payload.update(overrides)
    resp = await client.post("/api/v1/finance/accounts", headers=headers, json=payload)
    assert resp.status_code == 201
    return resp.json()


async def _create_lending(client: AsyncClient, headers: dict[str, str], **overrides) -> dict:
    payload = {"person_name": "Arjun", "direction": "lent", "amount": "1000"}
    payload.update(overrides)
    resp = await client.post("/api/v1/finance/lendings", headers=headers, json=payload)
    assert resp.status_code == 201
    return resp.json()


async def test_new_lending_has_zero_paid_and_full_outstanding(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    lending = await _create_lending(client, auth_headers, amount="1000")
    assert float(lending["amount_paid"]) == 0.0
    assert float(lending["outstanding"]) == 1000.0
    assert lending["payments"] == []
    assert lending["is_settled"] is False


async def test_partial_payment_reduces_outstanding_without_settling(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    lending = await _create_lending(client, auth_headers, amount="1000")

    resp = await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/payments",
        headers=auth_headers,
        json={"amount": "400"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert float(body["amount_paid"]) == 400.0
    assert float(body["outstanding"]) == 600.0
    assert body["is_settled"] is False
    assert len(body["payments"]) == 1
    assert float(body["payments"][0]["amount"]) == 400.0
    assert body["payments"][0]["account_id"] is None


async def test_payment_with_account_creates_transaction_and_updates_balance(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    account = await _create_account(client, auth_headers)  # opening_balance 1000
    lending = await _create_lending(client, auth_headers, amount="500", direction="lent")

    resp = await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/payments",
        headers=auth_headers,
        json={"amount": "500", "account_id": account["id"]},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["is_settled"] is True
    assert float(body["outstanding"]) == 0.0
    assert body["payments"][0]["account_id"] == account["id"]

    accounts = await client.get("/api/v1/finance/accounts", headers=auth_headers)
    updated = next(a for a in accounts.json() if a["id"] == account["id"])
    # "lent" repayment is income to the account it lands in: 1000 + 500
    assert float(updated["current_balance"]) == 1500.0


async def test_borrowed_repayment_is_an_expense_on_the_account(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    account = await _create_account(client, auth_headers)  # opening_balance 1000
    lending = await _create_lending(client, auth_headers, amount="300", direction="borrowed")

    await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/payments",
        headers=auth_headers,
        json={"amount": "300", "account_id": account["id"]},
    )
    accounts = await client.get("/api/v1/finance/accounts", headers=auth_headers)
    updated = next(a for a in accounts.json() if a["id"] == account["id"])
    assert float(updated["current_balance"]) == 700.0


async def test_multiple_partial_payments_accumulate_to_fully_settled(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    lending = await _create_lending(client, auth_headers, amount="900")

    await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/payments", headers=auth_headers, json={"amount": "300"}
    )
    second = await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/payments", headers=auth_headers, json={"amount": "300"}
    )
    assert second.json()["is_settled"] is False
    third = await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/payments", headers=auth_headers, json={"amount": "300"}
    )
    body = third.json()
    assert body["is_settled"] is True
    assert float(body["amount_paid"]) == 900.0
    assert len(body["payments"]) == 3


async def test_payment_exceeding_outstanding_is_rejected(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    lending = await _create_lending(client, auth_headers, amount="500")
    resp = await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/payments",
        headers=auth_headers,
        json={"amount": "600"},
    )
    assert resp.status_code == 400


async def test_zero_or_negative_payment_is_rejected(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    lending = await _create_lending(client, auth_headers, amount="500")
    resp = await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/payments",
        headers=auth_headers,
        json={"amount": "0"},
    )
    assert resp.status_code == 400


async def test_deleting_a_payment_reverses_its_transaction_and_unsettles(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    account = await _create_account(client, auth_headers)  # opening_balance 1000
    lending = await _create_lending(client, auth_headers, amount="500")

    payment_resp = await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/payments",
        headers=auth_headers,
        json={"amount": "500", "account_id": account["id"]},
    )
    assert payment_resp.json()["is_settled"] is True
    payment_id = payment_resp.json()["payments"][0]["id"]

    delete_resp = await client.delete(
        f"/api/v1/finance/lendings/{lending['id']}/payments/{payment_id}", headers=auth_headers
    )
    assert delete_resp.status_code == 200
    body = delete_resp.json()
    assert body["is_settled"] is False
    assert float(body["outstanding"]) == 500.0
    assert body["payments"] == []

    accounts = await client.get("/api/v1/finance/accounts", headers=auth_headers)
    updated = next(a for a in accounts.json() if a["id"] == account["id"])
    assert float(updated["current_balance"]) == 1000.0  # back to opening balance


async def test_update_lending_rejects_amount_below_already_paid(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    lending = await _create_lending(client, auth_headers, amount="1000")
    await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/payments", headers=auth_headers, json={"amount": "600"}
    )
    resp = await client.patch(
        f"/api/v1/finance/lendings/{lending['id']}", headers=auth_headers, json={"amount": "500"}
    )
    assert resp.status_code == 400


async def test_payments_require_ownership(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    lending = await _create_lending(client, auth_headers, amount="500")
    eve_headers = await _other_user_headers(client, "lending-payments-eve@example.com")

    add_resp = await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/payments", headers=eve_headers, json={"amount": "100"}
    )
    assert add_resp.status_code == 404

    own_payment = await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/payments", headers=auth_headers, json={"amount": "100"}
    )
    payment_id = own_payment.json()["payments"][0]["id"]
    delete_resp = await client.delete(
        f"/api/v1/finance/lendings/{lending['id']}/payments/{payment_id}", headers=eve_headers
    )
    assert delete_resp.status_code == 404
