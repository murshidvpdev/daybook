from httpx import AsyncClient


async def test_spent_this_month_excludes_lending_but_not_total(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    account = await client.post(
        "/api/v1/finance/accounts",
        headers=auth_headers,
        json={"name": "Wallet", "account_type": "cash", "opening_balance": "10000"},
    )
    account_id = account.json()["id"]

    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": account_id, "kind": "expense", "amount": "500", "note": "Groceries"},
    )
    await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Arjun", "direction": "lent", "amount": "2000", "account_id": account_id},
    )

    summary = await client.get("/api/v1/finance/analytics/summary", headers=auth_headers)
    body = summary.json()

    # The account balance and the all-inclusive "spent" figure both count the
    # lending transaction — it really did leave the account.
    assert float(body["spent_this_month"]) == 2500.0
    assert float(body["total_balance"]) == 10000 - 2500

    # But the "true spend" figure backs the lent amount back out, since it's
    # money you'll get back, not money that's gone.
    assert float(body["spent_this_month_excluding_lending"]) == 500.0


async def test_outstanding_lent_and_borrowed_track_unsettled_only(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    lent = await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Arjun", "direction": "lent", "amount": "2000"},
    )
    await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Priya", "direction": "lent", "amount": "500"},
    )
    await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Rahul", "direction": "borrowed", "amount": "1000"},
    )

    summary = await client.get("/api/v1/finance/analytics/summary", headers=auth_headers)
    body = summary.json()
    assert float(body["outstanding_lent"]) == 2500.0
    assert float(body["outstanding_borrowed"]) == 1000.0

    await client.post(f"/api/v1/finance/lendings/{lent.json()['id']}/settle", headers=auth_headers)

    summary_after = await client.get("/api/v1/finance/analytics/summary", headers=auth_headers)
    assert float(summary_after.json()["outstanding_lent"]) == 500.0


async def test_lending_without_account_does_not_affect_spend_totals(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Arjun", "direction": "lent", "amount": "2000"},
    )
    summary = await client.get("/api/v1/finance/analytics/summary", headers=auth_headers)
    body = summary.json()
    assert float(body["spent_this_month"]) == 0.0
    assert float(body["spent_this_month_excluding_lending"]) == 0.0
    assert float(body["outstanding_lent"]) == 2000.0
