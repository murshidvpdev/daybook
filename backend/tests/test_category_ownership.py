import uuid

from httpx import AsyncClient


async def test_transaction_rejects_another_users_category(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await client.post(
        "/api/v1/finance/accounts", headers=auth_headers, json={"name": "Wallet", "account_type": "cash"}
    )

    await client.post("/api/v1/auth/register", json={"email": "cat-eve@example.com", "password": "correcthorsebattery"})
    eve_login = await client.post(
        "/api/v1/auth/login", json={"email": "cat-eve@example.com", "password": "correcthorsebattery"}
    )
    eve_headers = {"Authorization": f"Bearer {eve_login.json()['access_token']}"}
    eve_category = await client.post(
        "/api/v1/finance/categories", headers=eve_headers, json={"name": "Eve's category", "kind": "expense"}
    )

    resp = await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={
            "account_id": account.json()["id"],
            "kind": "expense",
            "amount": "100",
            "category_id": eve_category.json()["id"],
        },
    )
    assert resp.status_code == 404


async def test_transaction_rejects_nonexistent_category(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await client.post(
        "/api/v1/finance/accounts", headers=auth_headers, json={"name": "Wallet", "account_type": "cash"}
    )
    resp = await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={
            "account_id": account.json()["id"],
            "kind": "expense",
            "amount": "100",
            "category_id": str(uuid.uuid4()),
        },
    )
    assert resp.status_code == 404


async def test_credit_card_spend_rejects_another_users_category(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await client.post(
        "/api/v1/finance/credit-cards",
        headers=auth_headers,
        json={"name": "Card", "due_day": 5},
    )

    await client.post("/api/v1/auth/register", json={"email": "cat-eve2@example.com", "password": "correcthorsebattery"})
    eve_login = await client.post(
        "/api/v1/auth/login", json={"email": "cat-eve2@example.com", "password": "correcthorsebattery"}
    )
    eve_headers = {"Authorization": f"Bearer {eve_login.json()['access_token']}"}
    eve_category = await client.post(
        "/api/v1/finance/categories", headers=eve_headers, json={"name": "Eve's category", "kind": "expense"}
    )

    resp = await client.post(
        f"/api/v1/finance/credit-cards/{card.json()['id']}/spend",
        headers=auth_headers,
        json={"amount": "100", "category_id": eve_category.json()["id"]},
    )
    assert resp.status_code == 404
