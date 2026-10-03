from datetime import date

from httpx import AsyncClient


async def _card(client: AsyncClient, headers: dict[str, str]) -> dict:
    resp = await client.post(
        "/api/v1/finance/credit-cards",
        headers=headers,
        json={"name": "HDFC Regalia", "credit_limit": "150000", "due_day": 5},
    )
    assert resp.status_code == 201
    return resp.json()


async def _bank(client: AsyncClient, headers: dict[str, str], opening: str = "50000") -> str:
    resp = await client.post(
        "/api/v1/finance/accounts",
        headers=headers,
        json={"name": "SBI", "account_type": "bank", "opening_balance": opening},
    )
    return resp.json()["id"]


async def _outstanding(client: AsyncClient, headers: dict[str, str]) -> float:
    cards = await client.get("/api/v1/finance/credit-cards", headers=headers)
    return float(cards.json()[0]["outstanding_balance"])


async def _balance(client: AsyncClient, headers: dict[str, str], account_id: str) -> float:
    accounts = await client.get("/api/v1/finance/accounts", headers=headers)
    return float(next(a for a in accounts.json() if a["id"] == account_id)["current_balance"])


async def _this_month_cashflow(client: AsyncClient, headers: dict[str, str]) -> dict:
    today = date.today()
    resp = await client.get(
        f"/api/v1/finance/analytics/monthly-cashflow?year={today.year}&month={today.month}&months=1",
        headers=headers,
    )
    return resp.json()[0]


async def _lent_on_card(client: AsyncClient, headers: dict[str, str], card_id: str, amount: str) -> dict:
    resp = await client.post(
        f"/api/v1/finance/credit-cards/{card_id}/spend",
        headers=headers,
        json={"amount": amount, "lend": {"person_name": "Arjun"}},
    )
    return resp.json()["lending"]


async def test_card_payment_from_bank_moves_both_balances_but_is_not_spending(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await _card(client, auth_headers)
    bank = await _bank(client, auth_headers)
    await client.post(f"/api/v1/finance/credit-cards/{card['id']}/spend", headers=auth_headers, json={"amount": "3000"})

    resp = await client.post(
        f"/api/v1/finance/credit-cards/{card['id']}/money-in",
        headers=auth_headers,
        json={"amount": "3000", "source": "payment", "from_account_id": bank},
    )
    assert resp.status_code == 201
    assert resp.json()["is_transfer"] is True

    assert await _outstanding(client, auth_headers) == 0
    assert await _balance(client, auth_headers, bank) == 47000
    flow = await _this_month_cashflow(client, auth_headers)
    assert float(flow["spent"]) == 3000  # the purchase, not the purchase plus paying it off
    assert float(flow["income"]) == 0


async def test_card_refund_lowers_outstanding(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _card(client, auth_headers)
    await client.post(f"/api/v1/finance/credit-cards/{card['id']}/spend", headers=auth_headers, json={"amount": "1000"})
    resp = await client.post(
        f"/api/v1/finance/credit-cards/{card['id']}/money-in",
        headers=auth_headers,
        json={"amount": "250", "source": "refund"},
    )
    assert resp.status_code == 201
    assert resp.json()["is_transfer"] is False
    assert await _outstanding(client, auth_headers) == 750


async def test_card_cannot_be_paid_from_another_card(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _card(client, auth_headers)
    other = await _card(client, auth_headers)
    resp = await client.post(
        f"/api/v1/finance/credit-cards/{card['id']}/money-in",
        headers=auth_headers,
        json={"amount": "100", "from_account_id": other["account_id"]},
    )
    assert resp.status_code == 400


async def test_match_statement_posts_the_difference(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _card(client, auth_headers)
    await client.post(f"/api/v1/finance/credit-cards/{card['id']}/spend", headers=auth_headers, json={"amount": "1000"})

    higher = await client.post(
        f"/api/v1/finance/credit-cards/{card['id']}/match-statement",
        headers=auth_headers,
        json={"actual_outstanding": "1180"},
    )
    assert higher.status_code == 200
    assert float(higher.json()["outstanding_balance"]) == 1180

    lower = await client.post(
        f"/api/v1/finance/credit-cards/{card['id']}/match-statement",
        headers=auth_headers,
        json={"actual_outstanding": "900"},
    )
    assert float(lower.json()["outstanding_balance"]) == 900


async def test_paying_a_bill_from_a_bank_account_drops_its_balance(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await _card(client, auth_headers)
    bank = await _bank(client, auth_headers)
    await client.post(f"/api/v1/finance/credit-cards/{card['id']}/spend", headers=auth_headers, json={"amount": "2000"})
    bill = (await client.post(f"/api/v1/finance/credit-cards/{card['id']}/bills", headers=auth_headers)).json()

    paid = await client.post(
        f"/api/v1/finance/credit-cards/bills/{bill['id']}/pay", headers=auth_headers, json={"from_account_id": bank}
    )
    assert paid.status_code == 200
    assert await _outstanding(client, auth_headers) == 0
    assert await _balance(client, auth_headers, bank) == 48000


async def test_converting_a_friends_card_spend_to_emi(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _card(client, auth_headers)
    lending = await _lent_on_card(client, auth_headers, card["id"], "30000")

    resp = await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/convert-to-emi",
        headers=auth_headers,
        json={
            "monthly_amount": "5300",
            "total_installments": 6,
            "processing_fee": "199",
            "start_date": date.today().isoformat(),
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    # The friend now owes the whole EMI cost, not just the original spend
    assert float(body["amount"]) == 5300 * 6 + 199
    assert body["emi"]["total_installments"] == 6
    assert body["emi"]["installments_paid"] == 0

    # The spend comes off the current bill; only the fee is left on it
    assert await _outstanding(client, auth_headers) == 199

    emis = (await client.get("/api/v1/finance/emis", headers=auth_headers)).json()
    assert len(emis) == 1 and emis[0]["lending_id"] == lending["id"]

    confirm = await client.post(f"/api/v1/finance/emis/{emis[0]['id']}/confirm-payment", headers=auth_headers)
    assert confirm.status_code == 200
    assert await _outstanding(client, auth_headers) == 199 + 5300

    # The friend's installment isn't your spending — the original spend already counted as lending
    flow = await _this_month_cashflow(client, auth_headers)
    assert float(flow["spent"]) == 0
    assert float(flow["lending_out"]) == 30000

    lendings = (await client.get("/api/v1/finance/lendings", headers=auth_headers)).json()
    assert lendings[0]["emi"]["installments_paid"] == 1


async def test_converting_twice_or_a_non_card_lending_is_rejected(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await _card(client, auth_headers)
    lending = await _lent_on_card(client, auth_headers, card["id"], "10000")
    payload = {"monthly_amount": "1800", "total_installments": 6}
    first = await client.post(f"/api/v1/finance/lendings/{lending['id']}/convert-to-emi", headers=auth_headers, json=payload)
    assert first.status_code == 200
    again = await client.post(f"/api/v1/finance/lendings/{lending['id']}/convert-to-emi", headers=auth_headers, json=payload)
    assert again.status_code == 400

    cash_lending = await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Ravi", "direction": "lent", "amount": "500"},
    )
    rejected = await client.post(
        f"/api/v1/finance/lendings/{cash_lending.json()['id']}/convert-to-emi", headers=auth_headers, json=payload
    )
    assert rejected.status_code == 400


async def test_deleting_an_untouched_emi_undoes_the_conversion(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await _card(client, auth_headers)
    lending = await _lent_on_card(client, auth_headers, card["id"], "12000")
    await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/convert-to-emi",
        headers=auth_headers,
        json={"monthly_amount": "2100", "total_installments": 6, "processing_fee": "99"},
    )
    emi_id = (await client.get("/api/v1/finance/emis", headers=auth_headers)).json()[0]["id"]

    resp = await client.delete(f"/api/v1/finance/emis/{emi_id}", headers=auth_headers)
    assert resp.status_code == 204

    assert await _outstanding(client, auth_headers) == 12000
    restored = (await client.get("/api/v1/finance/lendings", headers=auth_headers)).json()[0]
    assert float(restored["amount"]) == 12000
    assert restored["emi"] is None


async def test_editing_a_converted_lending_does_not_rewrite_the_original_spend(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await _card(client, auth_headers)
    lending = await _lent_on_card(client, auth_headers, card["id"], "6000")
    await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/convert-to-emi",
        headers=auth_headers,
        json={"monthly_amount": "1100", "total_installments": 6},
    )
    # Covering the interest yourself: the friend only owes the original 6,000
    resp = await client.patch(f"/api/v1/finance/lendings/{lending['id']}", headers=auth_headers, json={"amount": "6000"})
    assert resp.status_code == 200
    assert await _outstanding(client, auth_headers) == 0
