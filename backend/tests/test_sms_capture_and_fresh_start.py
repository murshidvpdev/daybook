from httpx import AsyncClient

HDFC_DEBIT = "Sent Rs.450.00 From HDFC Bank A/C *1234 To SWIGGY On 21/10/26 Ref 429112345678"
FRIEND_CREDIT = "Rs.2000.00 credited to A/c XX1234 on 21-10-26 by VPA arjun@ybl (UPI Ref No 429112345679)"
CARD_SPEND = "Rs.3000.00 spent on HDFC Bank Card x5678 at AMAZON on 2026-10-21:10:01:02."


async def _bank(client: AsyncClient, headers: dict[str, str], last_four: str | None = "1234") -> str:
    resp = await client.post(
        "/api/v1/finance/accounts",
        headers=headers,
        json={"name": "HDFC Savings", "account_type": "bank", "opening_balance": "10000", "last_four": last_four},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _key(client: AsyncClient, headers: dict[str, str]) -> str:
    resp = await client.post("/api/v1/capture/key", headers=headers)
    assert resp.status_code == 201
    return resp.json()["key"]


async def _send(client: AsyncClient, key: str, text: str) -> str:
    resp = await client.post("/api/v1/capture/sms", headers={"X-Daybook-Key": key}, json={"text": text})
    assert resp.status_code == 200, resp.text
    return resp.json()["status"]


async def _balance(client: AsyncClient, headers: dict[str, str], account_id: str) -> float:
    accounts = (await client.get("/api/v1/finance/accounts", headers=headers)).json()
    return float(next(a for a in accounts if a["id"] == account_id)["current_balance"])


async def test_sms_waits_for_review_then_books_on_the_matched_account(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    bank = await _bank(client, auth_headers)
    key = await _key(client, auth_headers)

    assert await _send(client, key, HDFC_DEBIT) == "captured"
    assert await _send(client, key, HDFC_DEBIT) == "duplicate"
    assert await _send(client, key, "Your OTP is 123456 for Rs 450") == "ignored"
    # Nothing moves until it's confirmed
    assert await _balance(client, auth_headers, bank) == 10000

    assert await _send(client, key, CARD_SPEND) == "captured"
    assert await _send(client, key, CARD_SPEND) == "duplicate"  # no reference, same text moments apart

    pending = (await client.get("/api/v1/capture/pending", headers=auth_headers)).json()
    assert len(pending) == 2
    capture = next(p for p in pending if p["counterparty"] == "SWIGGY")
    assert capture["account_id"] == bank and capture["counterparty"] == "SWIGGY"
    status = (await client.get("/api/v1/capture/key", headers=auth_headers)).json()
    assert status["enabled"] is True and status["pending_count"] == 2 and status["last_used_at"]

    resp = await client.post(
        f"/api/v1/capture/{capture['id']}/confirm",
        headers=auth_headers,
        json={"account_id": bank, "kind": "expense", "amount": "450"},
    )
    assert resp.status_code == 204
    assert await _balance(client, auth_headers, bank) == 9550
    assert len((await client.get("/api/v1/capture/pending", headers=auth_headers)).json()) == 1

    again = await client.post(
        f"/api/v1/capture/{capture['id']}/confirm",
        headers=auth_headers,
        json={"account_id": bank, "kind": "expense", "amount": "450"},
    )
    assert again.status_code == 404


async def test_friend_repayment_sms_books_against_the_lending(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    bank = await _bank(client, auth_headers)
    lending = await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Arjun", "direction": "lent", "amount": "5000"},
    )
    key = await _key(client, auth_headers)
    await _send(client, key, FRIEND_CREDIT)
    capture = (await client.get("/api/v1/capture/pending", headers=auth_headers)).json()[0]
    assert capture["kind"] == "income"

    resp = await client.post(
        f"/api/v1/capture/{capture['id']}/confirm",
        headers=auth_headers,
        json={"account_id": bank, "kind": "income", "amount": "2000", "lending_id": lending.json()["id"]},
    )
    assert resp.status_code == 204
    assert await _balance(client, auth_headers, bank) == 12000
    lendings = (await client.get("/api/v1/finance/lendings", headers=auth_headers)).json()
    assert float(lendings[0]["outstanding"]) == 3000


async def test_card_sms_can_be_booked_as_money_lent_to_a_friend(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await client.post(
        "/api/v1/finance/credit-cards",
        headers=auth_headers,
        json={"name": "HDFC Regalia", "last_four": "5678", "due_day": 5},
    )
    key = await _key(client, auth_headers)
    await _send(client, key, CARD_SPEND)
    capture = (await client.get("/api/v1/capture/pending", headers=auth_headers)).json()[0]
    assert capture["account_id"] == card.json()["account_id"]

    resp = await client.post(
        f"/api/v1/capture/{capture['id']}/confirm",
        headers=auth_headers,
        json={
            "account_id": card.json()["account_id"],
            "kind": "expense",
            "amount": "3000",
            "lend": {"person_name": "Ravi"},
        },
    )
    assert resp.status_code == 204
    lendings = (await client.get("/api/v1/finance/lendings", headers=auth_headers)).json()
    assert lendings[0]["person_name"] == "Ravi" and lendings[0]["account_id"] == card.json()["account_id"]
    cards = (await client.get("/api/v1/finance/credit-cards", headers=auth_headers)).json()
    assert float(cards[0]["outstanding_balance"]) == 3000


async def test_unknown_or_revoked_key_is_rejected(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    resp = await client.post("/api/v1/capture/sms", headers={"X-Daybook-Key": "nope"}, json={"text": HDFC_DEBIT})
    assert resp.status_code == 401

    old = await _key(client, auth_headers)
    new = await _key(client, auth_headers)  # making a new key revokes the old one
    assert (
        await client.post("/api/v1/capture/sms", headers={"X-Daybook-Key": old}, json={"text": HDFC_DEBIT})
    ).status_code == 401
    assert await _send(client, new, HDFC_DEBIT) == "captured"

    await client.delete("/api/v1/capture/key", headers=auth_headers)
    assert (
        await client.post("/api/v1/capture/sms", headers={"X-Daybook-Key": new}, json={"text": HDFC_DEBIT})
    ).status_code == 401


async def test_captures_are_private_per_user(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    key = await _key(client, auth_headers)
    await _send(client, key, HDFC_DEBIT)
    capture_id = (await client.get("/api/v1/capture/pending", headers=auth_headers)).json()[0]["id"]

    await client.post("/api/v1/auth/register", json={"email": "sms-eve@example.com", "password": "correcthorsebattery"})
    login = await client.post("/api/v1/auth/login", json={"email": "sms-eve@example.com", "password": "correcthorsebattery"})
    eve = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await client.get("/api/v1/capture/pending", headers=eve)).json() == []
    assert (await client.post(f"/api/v1/capture/{capture_id}/dismiss", headers=eve)).status_code == 404


async def test_backup_then_start_fresh_keeps_lendings_only(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    bank = await _bank(client, auth_headers)
    await client.post(
        "/api/v1/finance/transactions",
        headers=auth_headers,
        json={"account_id": bank, "kind": "expense", "amount": "100"},
    )
    card = await client.post(
        "/api/v1/finance/credit-cards", headers=auth_headers, json={"name": "HDFC Regalia", "due_day": 5}
    )
    spend = await client.post(
        f"/api/v1/finance/credit-cards/{card.json()['id']}/spend",
        headers=auth_headers,
        json={"amount": "2000", "lend": {"person_name": "Arjun"}},
    )
    lending_id = spend.json()["lending"]["id"]
    await client.post(
        f"/api/v1/finance/lendings/{lending_id}/payments",
        headers=auth_headers,
        json={"amount": "500", "account_id": bank},
    )

    backup = (await client.get("/api/v1/finance/backup", headers=auth_headers)).json()
    assert backup["daybook_backup_version"] == 1
    assert len(backup["accounts"]) == 2 and len(backup["credit_cards"]) == 1
    assert len(backup["transactions"]) == 3 and len(backup["lendings"]) == 1
    assert len(backup["lending_payments"]) == 1

    refused = await client.post("/api/v1/finance/start-fresh", headers=auth_headers, json={"confirm": "yes"})
    assert refused.status_code == 422
    resp = await client.post("/api/v1/finance/start-fresh", headers=auth_headers, json={"confirm": "START FRESH"})
    assert resp.status_code == 204

    assert (await client.get("/api/v1/finance/accounts", headers=auth_headers)).json() == []
    assert (await client.get("/api/v1/finance/credit-cards", headers=auth_headers)).json() == []
    assert (await client.get("/api/v1/finance/transactions", headers=auth_headers)).json() == []
    lendings = (await client.get("/api/v1/finance/lendings", headers=auth_headers)).json()
    assert len(lendings) == 1
    assert lendings[0]["person_name"] == "Arjun"
    assert float(lendings[0]["outstanding"]) == 1500  # repayment history survives
    assert lendings[0]["transaction_id"] is None


async def test_start_fresh_only_touches_your_own_data(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await client.post("/api/v1/auth/register", json={"email": "fresh-eve@example.com", "password": "correcthorsebattery"})
    login = await client.post(
        "/api/v1/auth/login", json={"email": "fresh-eve@example.com", "password": "correcthorsebattery"}
    )
    eve = {"Authorization": f"Bearer {login.json()['access_token']}"}
    await _bank(client, eve)

    await client.post("/api/v1/finance/start-fresh", headers=auth_headers, json={"confirm": "START FRESH"})
    assert len((await client.get("/api/v1/finance/accounts", headers=eve)).json()) == 1


async def test_card_bill_payment_sms_books_once_as_a_transfer(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    bank = await _bank(client, auth_headers, last_four="7762")
    card = await client.post(
        "/api/v1/finance/credit-cards",
        headers=auth_headers,
        json={"name": "ICICI Amazon", "last_four": "7005", "due_day": 5, "opening_balance": "6588.54"},
    )
    key = await _key(client, auth_headers)
    await _send(client, key, "Debited Rs 6588.54 from a/c X7762 on 16Oct26 10:00 via UPI to ICICI CARD. Ref 616374398761.")
    await _send(
        client,
        key,
        "Payment of Rs 6,588.54 has been received on your ICICI Bank Credit Card XX7005 through "
        "Bharat Bill Payment System on 16-OCT-26.",
    )
    pending = (await client.get("/api/v1/capture/pending", headers=auth_headers)).json()
    bank_side = next(p for p in pending if p["kind"] == "expense")
    card_side = next(p for p in pending if p["kind"] == "income")
    assert card_side["account_id"] == card.json()["account_id"]

    resp = await client.post(
        f"/api/v1/capture/{bank_side['id']}/confirm",
        headers=auth_headers,
        json={"account_id": bank, "kind": "expense", "amount": "6588.54", "pay_card_id": card.json()["id"]},
    )
    assert resp.status_code == 204
    await client.post(f"/api/v1/capture/{card_side['id']}/dismiss", headers=auth_headers)

    assert await _balance(client, auth_headers, bank) == 10000 - 6588.54
    cards = (await client.get("/api/v1/finance/credit-cards", headers=auth_headers)).json()
    assert float(cards[0]["outstanding_balance"]) == 0
    txns = (await client.get("/api/v1/finance/transactions", headers=auth_headers)).json()
    assert txns and all(t["is_transfer"] for t in txns)  # not spending, not income
