from datetime import date

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


async def _create_credit_card(client: AsyncClient, headers: dict[str, str], due_day: int = 5) -> dict:
    resp = await client.post(
        "/api/v1/finance/credit-cards",
        headers=headers,
        json={"name": "HDFC Regalia", "last_four": "4242", "credit_limit": "150000", "due_day": due_day},
    )
    assert resp.status_code == 201
    return resp.json()


# --- Accounts -----------------------------------------------------------------


async def test_update_account_changes_fields(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await _create_account(client, auth_headers)
    resp = await client.patch(
        f"/api/v1/finance/accounts/{account['id']}",
        headers=auth_headers,
        json={"name": "Renamed Bank", "opening_balance": "2000"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Renamed Bank"
    assert float(body["opening_balance"]) == 2000.0


async def test_update_account_rejects_other_users_account(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await _create_account(client, auth_headers)
    eve_headers = await _other_user_headers(client, "update-acct-eve@example.com")
    resp = await client.patch(
        f"/api/v1/finance/accounts/{account['id']}", headers=eve_headers, json={"name": "Hijacked"}
    )
    assert resp.status_code == 404


async def test_update_credit_card_backed_account_is_blocked(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _create_credit_card(client, auth_headers)
    resp = await client.patch(
        f"/api/v1/finance/accounts/{card['account_id']}", headers=auth_headers, json={"name": "Sneaky"}
    )
    assert resp.status_code == 400


async def test_delete_account_removes_it(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await _create_account(client, auth_headers)
    resp = await client.delete(f"/api/v1/finance/accounts/{account['id']}", headers=auth_headers)
    assert resp.status_code == 204
    listed = await client.get("/api/v1/finance/accounts", headers=auth_headers)
    assert all(a["id"] != account["id"] for a in listed.json())


async def test_delete_credit_card_backed_account_is_blocked(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _create_credit_card(client, auth_headers)
    resp = await client.delete(f"/api/v1/finance/accounts/{card['account_id']}", headers=auth_headers)
    assert resp.status_code == 400


# --- Categories -----------------------------------------------------------------


async def test_update_and_delete_category(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post(
        "/api/v1/finance/categories", headers=auth_headers, json={"name": "Groceries", "kind": "expense"}
    )
    category_id = create.json()["id"]

    update = await client.patch(
        f"/api/v1/finance/categories/{category_id}", headers=auth_headers, json={"name": "Food"}
    )
    assert update.status_code == 200
    assert update.json()["name"] == "Food"

    delete = await client.delete(f"/api/v1/finance/categories/{category_id}", headers=auth_headers)
    assert delete.status_code == 204

    listed = await client.get("/api/v1/finance/categories", headers=auth_headers)
    assert all(c["id"] != category_id for c in listed.json())


async def test_deleting_category_falls_back_transactions_to_uncategorized(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    account = await _create_account(client, auth_headers)
    category = await client.post(
        "/api/v1/finance/categories", headers=auth_headers, json={"name": "Fun", "kind": "expense"}
    )
    category_id = category.json()["id"]

    txn = await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "category_id": category_id, "amount": "100"},
    )
    txn_id = txn.json()["id"]

    await client.delete(f"/api/v1/finance/categories/{category_id}", headers=auth_headers)

    listed = await client.get("/api/v1/finance/transactions", headers=auth_headers)
    updated_txn = next(t for t in listed.json() if t["id"] == txn_id)
    assert updated_txn["category_id"] is None


async def test_update_category_rejects_other_users_category(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post(
        "/api/v1/finance/categories", headers=auth_headers, json={"name": "Private", "kind": "expense"}
    )
    category_id = create.json()["id"]
    eve_headers = await _other_user_headers(client, "update-cat-eve@example.com")
    resp = await client.patch(
        f"/api/v1/finance/categories/{category_id}", headers=eve_headers, json={"name": "Hijacked"}
    )
    assert resp.status_code == 404


# --- Transactions -----------------------------------------------------------------


async def test_update_transaction_changes_amount_and_account(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account_a = await _create_account(client, auth_headers, name="A")
    account_b = await _create_account(client, auth_headers, name="B")

    txn = await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account_a["id"], "amount": "100", "kind": "expense"},
    )
    txn_id = txn.json()["id"]

    resp = await client.patch(
        f"/api/v1/finance/transactions/{txn_id}",
        headers=auth_headers,
        json={"account_id": account_b["id"], "amount": "250"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["account_id"] == account_b["id"]
    assert float(body["amount"]) == 250.0

    accounts = await client.get("/api/v1/finance/accounts", headers=auth_headers)
    by_id = {a["id"]: a for a in accounts.json()}
    assert float(by_id[account_a["id"]]["current_balance"]) == 1000.0
    assert float(by_id[account_b["id"]]["current_balance"]) == 750.0


async def test_update_transaction_rejects_unowned_account(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await _create_account(client, auth_headers)
    txn = await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "amount": "100"},
    )
    txn_id = txn.json()["id"]

    eve_headers = await _other_user_headers(client, "update-txn-eve@example.com")
    eve_account = await _create_account(client, eve_headers, name="Eve Bank")

    resp = await client.patch(
        f"/api/v1/finance/transactions/{txn_id}",
        headers=auth_headers,
        json={"account_id": eve_account["id"]},
    )
    assert resp.status_code == 404


async def test_update_transaction_rejects_other_users_transaction(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await _create_account(client, auth_headers)
    txn = await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "amount": "100"},
    )
    txn_id = txn.json()["id"]

    eve_headers = await _other_user_headers(client, "update-txn-eve2@example.com")
    resp = await client.patch(
        f"/api/v1/finance/transactions/{txn_id}", headers=eve_headers, json={"amount": "1"}
    )
    assert resp.status_code == 404


# --- Credit cards -----------------------------------------------------------------


async def test_update_credit_card_fields(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _create_credit_card(client, auth_headers, due_day=5)
    resp = await client.patch(
        f"/api/v1/finance/credit-cards/{card['id']}",
        headers=auth_headers,
        json={"name": "New Name", "due_day": 12, "credit_limit": "200000"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "New Name"
    assert body["due_day"] == 12
    assert float(body["credit_limit"]) == 200000.0


async def test_update_credit_card_rejects_invalid_due_day(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _create_credit_card(client, auth_headers)
    resp = await client.patch(
        f"/api/v1/finance/credit-cards/{card['id']}", headers=auth_headers, json={"due_day": 40}
    )
    assert resp.status_code == 422


async def test_update_credit_card_rejects_other_users_card(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _create_credit_card(client, auth_headers)
    eve_headers = await _other_user_headers(client, "update-card-eve@example.com")
    resp = await client.patch(
        f"/api/v1/finance/credit-cards/{card['id']}", headers=eve_headers, json={"name": "Hijacked"}
    )
    assert resp.status_code == 404


# --- EMIs -----------------------------------------------------------------


async def test_update_emi_due_day_recomputes_next_due_date(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _create_credit_card(client, auth_headers, due_day=5)
    create = await client.post(
        "/api/v1/finance/emis",
        headers=auth_headers,
        json={
            "account_id": card["account_id"],
            "name": "iPhone EMI",
            "monthly_amount": "3500",
            "total_installments": 10,
            "due_day": 5,
        },
    )
    emi_id = create.json()["id"]
    original_due = date.fromisoformat(create.json()["next_due_date"])

    resp = await client.patch(
        f"/api/v1/finance/emis/{emi_id}", headers=auth_headers, json={"due_day": 20, "name": "Laptop EMI"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Laptop EMI"
    assert body["due_day"] == 20
    assert date.fromisoformat(body["next_due_date"]) != original_due


async def test_update_emi_rejects_other_users_emi(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _create_credit_card(client, auth_headers)
    create = await client.post(
        "/api/v1/finance/emis",
        headers=auth_headers,
        json={
            "account_id": card["account_id"],
            "name": "iPhone EMI",
            "monthly_amount": "3500",
            "total_installments": 10,
            "due_day": 5,
        },
    )
    emi_id = create.json()["id"]
    eve_headers = await _other_user_headers(client, "update-emi-eve@example.com")
    resp = await client.patch(f"/api/v1/finance/emis/{emi_id}", headers=eve_headers, json={"name": "Hijacked"})
    assert resp.status_code == 404


# --- SIPs -----------------------------------------------------------------


async def test_update_sip_due_day_recomputes_next_due_date(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await _create_account(client, auth_headers)
    create = await client.post(
        "/api/v1/finance/sips",
        headers=auth_headers,
        json={"account_id": account["id"], "name": "Index Fund", "amount": "5000", "due_day": 5},
    )
    sip_id = create.json()["id"]
    original_due = date.fromisoformat(create.json()["next_due_date"])

    resp = await client.patch(
        f"/api/v1/finance/sips/{sip_id}", headers=auth_headers, json={"due_day": 20, "amount": "6000"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert float(body["amount"]) == 6000.0
    assert body["due_day"] == 20
    assert date.fromisoformat(body["next_due_date"]) != original_due


async def test_update_sip_rejects_other_users_sip(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await _create_account(client, auth_headers)
    create = await client.post(
        "/api/v1/finance/sips",
        headers=auth_headers,
        json={"account_id": account["id"], "name": "Index Fund", "amount": "5000", "due_day": 5},
    )
    sip_id = create.json()["id"]
    eve_headers = await _other_user_headers(client, "update-sip-eve@example.com")
    resp = await client.patch(f"/api/v1/finance/sips/{sip_id}", headers=eve_headers, json={"amount": "1"})
    assert resp.status_code == 404


# --- Lending -----------------------------------------------------------------


async def test_update_lending_syncs_linked_transaction_amount(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await _create_account(client, auth_headers)
    create = await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={
            "person_name": "Arjun",
            "direction": "lent",
            "amount": "2000",
            "account_id": account["id"],
        },
    )
    lending_id = create.json()["id"]

    resp = await client.patch(
        f"/api/v1/finance/lendings/{lending_id}", headers=auth_headers, json={"amount": "2500"}
    )
    assert resp.status_code == 200
    assert float(resp.json()["amount"]) == 2500.0

    accounts = await client.get("/api/v1/finance/accounts", headers=auth_headers)
    updated_account = next(a for a in accounts.json() if a["id"] == account["id"])
    # opening 1000 minus the now-corrected 2500 lent expense
    assert float(updated_account["current_balance"]) == -1500.0


async def test_update_lending_without_linked_account_only_changes_record(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Priya", "direction": "borrowed", "amount": "1000"},
    )
    lending_id = create.json()["id"]

    resp = await client.patch(
        f"/api/v1/finance/lendings/{lending_id}",
        headers=auth_headers,
        json={"person_name": "Priya Sharma", "note": "corrected spelling"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["person_name"] == "Priya Sharma"
    assert body["note"] == "corrected spelling"
    assert float(body["amount"]) == 1000.0


async def test_update_lending_rejects_other_users_lending(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Arjun", "direction": "lent", "amount": "2000"},
    )
    lending_id = create.json()["id"]
    eve_headers = await _other_user_headers(client, "update-lending-eve@example.com")
    resp = await client.patch(
        f"/api/v1/finance/lendings/{lending_id}", headers=eve_headers, json={"amount": "1"}
    )
    assert resp.status_code == 404
