from datetime import date

from httpx import AsyncClient


async def _card(client: AsyncClient, headers: dict[str, str]) -> dict:
    resp = await client.post(
        "/api/v1/finance/credit-cards", headers=headers, json={"name": "HSBC", "due_day": 5, "credit_limit": "150000"}
    )
    return resp.json()


async def _outstanding(client: AsyncClient, headers: dict[str, str]) -> float:
    return float((await client.get("/api/v1/finance/credit-cards", headers=headers)).json()[0]["outstanding_balance"])


async def _spent_this_month(client: AsyncClient, headers: dict[str, str]) -> float:
    today = date.today()
    resp = await client.get(
        f"/api/v1/finance/analytics/monthly-cashflow?year={today.year}&month={today.month}&months=1", headers=headers
    )
    return float(resp.json()[0]["spent"])


async def test_own_purchase_emi_counts_only_fee_and_interest_as_new_spending(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await _card(client, auth_headers)
    await client.post(
        f"/api/v1/finance/credit-cards/{card['id']}/spend", headers=auth_headers, json={"amount": "30000", "note": "Phone"}
    )
    resp = await client.post(
        f"/api/v1/finance/credit-cards/{card['id']}/convert-to-emi",
        headers=auth_headers,
        json={
            "name": "Phone",
            "amount": "30000",
            "monthly_amount": "5300",
            "total_installments": 6,
            "processing_fee": "199",
            "start_date": date.today().isoformat(),
        },
    )
    assert resp.status_code == 201
    emi = resp.json()
    assert float(emi["principal_amount"]) == 30000

    # The purchase leaves the current dues; the fee is charged now, and the
    # first installment (due today) posts on its own
    assert await _outstanding(client, auth_headers) == 199 + 5300
    # Only the interest part of the installment (5300 - 5000) is new spending
    assert await _spent_this_month(client, auth_headers) == 30000 + 199 + 300

    txns = (await client.get("/api/v1/finance/transactions", headers=auth_headers)).json()
    interest = [t for t in txns if (t["note"] or "").endswith("— interest")]
    assert len(interest) == 1 and float(interest[0]["amount"]) == 300 and interest[0]["is_transfer"] is False


async def test_emi_must_cover_the_amount_and_can_be_undone_before_any_charge(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await _card(client, auth_headers)
    await client.post(f"/api/v1/finance/credit-cards/{card['id']}/spend", headers=auth_headers, json={"amount": "12000"})
    too_small = await client.post(
        f"/api/v1/finance/credit-cards/{card['id']}/convert-to-emi",
        headers=auth_headers,
        json={"name": "TV", "amount": "12000", "monthly_amount": "1000", "total_installments": 6},
    )
    assert too_small.status_code == 400

    emi = (
        await client.post(
            f"/api/v1/finance/credit-cards/{card['id']}/convert-to-emi",
            headers=auth_headers,
            json={"name": "TV", "amount": "12000", "monthly_amount": "2100", "total_installments": 6},
        )
    ).json()
    assert await _outstanding(client, auth_headers) == 0
    await client.delete(f"/api/v1/finance/emis/{emi['id']}", headers=auth_headers)
    assert await _outstanding(client, auth_headers) == 12000


async def test_last_installment_absorbs_rounding(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _card(client, auth_headers)
    await client.post(f"/api/v1/finance/credit-cards/{card['id']}/spend", headers=auth_headers, json={"amount": "10000"})
    resp = await client.post(
        f"/api/v1/finance/credit-cards/{card['id']}/convert-to-emi",
        headers=auth_headers,
        json={
            "name": "Laptop",
            "amount": "10000",
            "monthly_amount": "3500",
            "total_installments": 3,
            "start_date": "2026-01-05",
        },
    )
    assert resp.status_code == 201
    # All three installments are long past due, so they post on the next read
    emis = (await client.get("/api/v1/finance/emis", headers=auth_headers)).json()
    assert emis[0]["installments_paid"] == 3 and emis[0]["is_completed"] is True

    txns = (await client.get("/api/v1/finance/transactions?limit=100", headers=auth_headers)).json()
    principal = sum(float(t["amount"]) for t in txns if (t["note"] or "").startswith("EMI: Laptop") and t["is_transfer"])
    interest = sum(float(t["amount"]) for t in txns if (t["note"] or "").endswith("— interest"))
    assert round(principal, 2) == 10000
    assert round(interest, 2) == 500
