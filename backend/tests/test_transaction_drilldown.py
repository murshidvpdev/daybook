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


async def test_list_transactions_search_matches_note_category_and_amount(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    account = await _create_account(client, auth_headers)
    groceries = await client.post(
        "/api/v1/finance/categories", headers=auth_headers, json={"name": "Groceries", "kind": "expense"}
    )
    groceries_id = groceries.json()["id"]

    async def add(amount: str, note: str | None, category_id: str | None = None) -> str:
        resp = await client.post(
            "/api/v1/finance/transactions",
            headers=auth_headers,
            json={
                "account_id": account["id"],
                "kind": "expense",
                "amount": amount,
                "note": note,
                "category_id": category_id,
            },
        )
        return resp.json()["id"]

    swiggy = await add("320", "Swiggy dinner")
    veg = await add("180", "Vegetables", groceries_id)
    fuel = await add("450", "Petrol")
    await add("90", "50% off coffee")

    async def search(q: str) -> set[str]:
        resp = await client.get("/api/v1/finance/transactions", headers=auth_headers, params={"q": q})
        assert resp.status_code == 200
        return {t["id"] for t in resp.json()}

    assert await search("swiggy") == {swiggy}  # note, case-insensitive
    assert await search("grocer") == {veg}  # category name
    assert await search("450") == {fuel}  # exact amount
    assert len(await search("%")) == 1  # LIKE wildcard is matched literally
    assert len(await search("   ")) == 4  # blank search is no filter


async def test_list_transactions_search_combines_with_date_range(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    account = await _create_account(client, auth_headers)
    for occurred_on in ("2026-02-10", "2026-03-10"):
        await client.post(
            "/api/v1/finance/transactions",
            headers=auth_headers,
            json={
                "account_id": account["id"],
                "kind": "expense",
                "amount": "99",
                "note": "Netflix",
                "occurred_on": occurred_on,
            },
        )
    resp = await client.get(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        params={"q": "netflix", "start": "2026-03-01", "end": "2026-03-31"},
    )
    assert [t["occurred_on"] for t in resp.json()] == ["2026-03-10"]


async def test_list_transactions_rejects_out_of_range_limit(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    resp = await client.get("/api/v1/finance/transactions?limit=100000", headers=auth_headers)
    assert resp.status_code == 422
