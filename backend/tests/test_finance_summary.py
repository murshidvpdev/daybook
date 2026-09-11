from httpx import AsyncClient


async def test_summary_reflects_balances_and_debt(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    bank = await client.post(
        "/api/v1/finance/accounts",
        headers=auth_headers,
        json={"name": "HDFC Bank", "account_type": "bank", "opening_balance": "50000"},
    )
    await client.post(
        "/api/v1/finance/accounts",
        headers=auth_headers,
        json={"name": "Wallet", "account_type": "cash", "opening_balance": "2000"},
    )
    card = await client.post(
        "/api/v1/finance/credit-cards",
        headers=auth_headers,
        json={"name": "HDFC Regalia", "due_day": 5, "opening_balance": "1500"},
    )

    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": bank.json()["id"], "kind": "expense", "amount": "3000"},
    )
    await client.post(
        f"/api/v1/finance/credit-cards/{card.json()['id']}/spend",
        headers=auth_headers,
        json={"amount": "500", "note": "Groceries"},
    )

    summary = await client.get("/api/v1/finance/analytics/summary", headers=auth_headers)
    assert summary.status_code == 200
    body = summary.json()

    assert float(body["total_balance"]) == 50000 - 3000 + 2000  # bank + cash, minus the bank expense
    assert float(body["total_credit_card_debt"]) == 1500 + 500
    assert float(body["net_worth"]) == float(body["total_balance"]) - float(body["total_credit_card_debt"])
    assert float(body["spent_this_month"]) == 3000 + 500
    assert body["top_spend_account"]["account_name"] in ("HDFC Bank", "HDFC Regalia")


async def test_summary_top_spend_account_picks_the_highest(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    small = await client.post(
        "/api/v1/finance/accounts", headers=auth_headers, json={"name": "Wallet", "account_type": "cash"}
    )
    big = await client.post(
        "/api/v1/finance/accounts", headers=auth_headers, json={"name": "HDFC Bank", "account_type": "bank"}
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": small.json()["id"], "kind": "expense", "amount": "100"},
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": big.json()["id"], "kind": "expense", "amount": "9000"},
    )

    summary = await client.get("/api/v1/finance/analytics/summary", headers=auth_headers)
    assert summary.json()["top_spend_account"]["account_name"] == "HDFC Bank"
    assert float(summary.json()["top_spend_account"]["total"]) == 9000.0


async def test_summary_with_no_data_is_all_zero(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    summary = await client.get("/api/v1/finance/analytics/summary", headers=auth_headers)
    body = summary.json()
    assert float(body["total_balance"]) == 0.0
    assert float(body["total_credit_card_debt"]) == 0.0
    assert float(body["spent_this_month"]) == 0.0
    assert body["top_spend_account"] is None


async def test_account_breakdown_ranks_by_spend(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    a = await client.post(
        "/api/v1/finance/accounts", headers=auth_headers, json={"name": "Wallet", "account_type": "cash"}
    )
    b = await client.post(
        "/api/v1/finance/accounts", headers=auth_headers, json={"name": "HDFC Bank", "account_type": "bank"}
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": a.json()["id"], "kind": "expense", "amount": "200"},
    )
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": b.json()["id"], "kind": "expense", "amount": "800"},
    )

    resp = await client.get("/api/v1/finance/analytics/account-breakdown", headers=auth_headers)
    rows = resp.json()
    assert rows[0]["account_name"] == "HDFC Bank"
    assert float(rows[0]["total"]) == 800.0
    assert rows[1]["account_name"] == "Wallet"
