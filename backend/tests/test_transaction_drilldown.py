from httpx import AsyncClient


async def _create_account(client: AsyncClient, headers: dict[str, str], name: str = "Wallet") -> dict:
    resp = await client.post("/api/v1/finance/accounts", headers=headers, json={"name": name})
    assert resp.status_code == 201
    return resp.json()


async def test_category_breakdown_includes_category_id_for_drilldown(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    account = await _create_account(client, auth_headers)
    category = await client.post(
        "/api/v1/finance/categories", headers=auth_headers, json={"name": "Food", "kind": "expense"}
    )
    category_id = category.json()["id"]
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "kind": "expense", "amount": "200", "category_id": category_id},
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "kind": "expense", "amount": "100"},
    )

    resp = await client.get("/api/v1/finance/analytics/category-breakdown", headers=auth_headers)
    by_name = {row["category_name"]: row for row in resp.json()}
    assert by_name["Food"]["category_id"] == category_id
    assert by_name["Uncategorized"]["category_id"] is None


async def test_account_breakdown_includes_account_id_for_drilldown(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    account = await _create_account(client, auth_headers)
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "kind": "expense", "amount": "150"},
    )
    resp = await client.get("/api/v1/finance/analytics/account-breakdown", headers=auth_headers)
    assert resp.json()[0]["account_id"] == account["id"]


async def test_list_transactions_filters_by_category(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await _create_account(client, auth_headers)
    food = await client.post(
        "/api/v1/finance/categories", headers=auth_headers, json={"name": "Food", "kind": "expense"}
    )
    food_id = food.json()["id"]
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "kind": "expense", "amount": "200", "category_id": food_id},
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "kind": "expense", "amount": "100"},
    )

    resp = await client.get(f"/api/v1/finance/transactions?category_id={food_id}", headers=auth_headers)
    txns = resp.json()
    assert len(txns) == 1
    assert float(txns[0]["amount"]) == 200.0


async def test_list_transactions_filters_uncategorized(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await _create_account(client, auth_headers)
    food = await client.post(
        "/api/v1/finance/categories", headers=auth_headers, json={"name": "Food", "kind": "expense"}
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "kind": "expense", "amount": "200", "category_id": food.json()["id"]},
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "kind": "expense", "amount": "100"},
    )

    resp = await client.get("/api/v1/finance/transactions?uncategorized=true", headers=auth_headers)
    txns = resp.json()
    assert len(txns) == 1
    assert float(txns[0]["amount"]) == 100.0


async def test_list_transactions_filters_by_account_and_date_range(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    wallet = await _create_account(client, auth_headers, "Wallet")
    bank = await _create_account(client, auth_headers, "Bank")
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": wallet["id"], "kind": "expense", "amount": "50", "occurred_on": "2026-03-10"},
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": bank["id"], "kind": "expense", "amount": "999", "occurred_on": "2026-03-10"},
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": wallet["id"], "kind": "expense", "amount": "77", "occurred_on": "2026-04-01"},
    )

    resp = await client.get(
        f"/api/v1/finance/transactions?account_id={wallet['id']}&start=2026-03-01&end=2026-03-31",
        headers=auth_headers,
    )
    txns = resp.json()
    assert len(txns) == 1
    assert float(txns[0]["amount"]) == 50.0


async def test_list_transactions_filters_by_kind(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await _create_account(client, auth_headers)
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "kind": "expense", "amount": "200"},
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "kind": "income", "amount": "5000"},
    )

    resp = await client.get("/api/v1/finance/transactions?kind=income", headers=auth_headers)
    txns = resp.json()
    assert len(txns) == 1
    assert txns[0]["kind"] == "income"
    assert float(txns[0]["amount"]) == 5000.0


async def test_list_transactions_without_filters_is_unchanged(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    account = await _create_account(client, auth_headers)
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "kind": "expense", "amount": "10"},
    )
    resp = await client.get("/api/v1/finance/transactions", headers=auth_headers)
    assert len(resp.json()) == 1


async def test_transaction_filters_respect_ownership(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await _create_account(client, auth_headers)
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account["id"], "kind": "expense", "amount": "500"},
    )

    await client.post(
        "/api/v1/auth/register", json={"email": "drilldown-eve@example.com", "password": "correcthorsebattery"}
    )
    eve_login = await client.post(
        "/api/v1/auth/login", json={"email": "drilldown-eve@example.com", "password": "correcthorsebattery"}
    )
    eve_headers = {"Authorization": f"Bearer {eve_login.json()['access_token']}"}

    resp = await client.get(f"/api/v1/finance/transactions?account_id={account['id']}", headers=eve_headers)
    assert resp.json() == []
