from datetime import date, timedelta

from httpx import AsyncClient


async def _create_credit_card(client: AsyncClient, headers: dict[str, str], due_day: int = 5) -> dict:
    resp = await client.post(
        "/api/v1/finance/credit-cards",
        headers=headers,
        json={"name": "HDFC Regalia", "last_four": "4242", "credit_limit": "150000", "due_day": due_day},
    )
    assert resp.status_code == 201
    return resp.json()


async def test_credit_card_rejects_invalid_due_day(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    resp = await client.post(
        "/api/v1/finance/credit-cards",
        headers=auth_headers,
        json={"name": "Bad Card", "due_day": 40},
    )
    assert resp.status_code == 422


async def test_emi_is_not_charged_until_confirmed(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    """EMIs never auto-generate their transaction — see confirm_emi_payment.
    Listing (even repeatedly) must never move installments_paid or the balance
    on its own; only an explicit confirm-payment call may do that."""
    card = await _create_credit_card(client, auth_headers, due_day=5)
    three_months_ago = date.today().replace(day=5) - timedelta(days=95)

    create = await client.post(
        "/api/v1/finance/emis",
        headers=auth_headers,
        json={
            "account_id": card["account_id"],
            "name": "iPhone EMI",
            "monthly_amount": "3500",
            "total_installments": 10,
            "due_day": 5,
            "start_date": three_months_ago.isoformat(),
        },
    )
    assert create.status_code == 201

    for _ in range(2):
        listed = await client.get("/api/v1/finance/emis", headers=auth_headers)
        emi = listed.json()[0]
        assert emi["installments_paid"] == 0
        assert emi["is_due"] is True
        assert emi["next_due_date"] == three_months_ago.isoformat()

    cards = await client.get("/api/v1/finance/credit-cards", headers=auth_headers)
    assert float(cards.json()[0]["outstanding_balance"]) == 0.0
    txns = await client.get("/api/v1/finance/transactions", headers=auth_headers)
    assert txns.json() == []


async def test_confirming_emi_payment_charges_one_installment_and_advances(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    card = await _create_credit_card(client, auth_headers, due_day=5)
    three_months_ago = date.today().replace(day=5) - timedelta(days=95)

    create = await client.post(
        "/api/v1/finance/emis",
        headers=auth_headers,
        json={
            "account_id": card["account_id"],
            "name": "iPhone EMI",
            "monthly_amount": "3500",
            "total_installments": 10,
            "due_day": 5,
            "start_date": three_months_ago.isoformat(),
        },
    )
    emi_id = create.json()["id"]

    confirm = await client.post(f"/api/v1/finance/emis/{emi_id}/confirm-payment", headers=auth_headers)
    assert confirm.status_code == 200
    body = confirm.json()
    assert body["installments_paid"] == 1
    # ~3 months overdue at monthly cadence — still due after just one confirm.
    assert body["is_due"] is True
    assert date.fromisoformat(body["next_due_date"]) > three_months_ago

    cards = await client.get("/api/v1/finance/credit-cards", headers=auth_headers)
    assert float(cards.json()[0]["outstanding_balance"]) == 3500.0

    # Keep confirming, one call per overdue cycle, until fully caught up.
    last = body
    confirmations = 1
    while last["is_due"] and confirmations < 10:
        resp = await client.post(f"/api/v1/finance/emis/{emi_id}/confirm-payment", headers=auth_headers)
        last = resp.json()
        confirmations += 1

    assert last["is_due"] is False
    assert last["installments_paid"] == confirmations
    assert date.fromisoformat(last["next_due_date"]) > date.today()

    cards_after = await client.get("/api/v1/finance/credit-cards", headers=auth_headers)
    assert float(cards_after.json()[0]["outstanding_balance"]) == confirmations * 3500.0


async def test_cannot_confirm_emi_payment_before_due_date(client: AsyncClient, auth_headers: dict[str, str]) -> None:
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
    assert create.json()["is_due"] is False

    resp = await client.post(f"/api/v1/finance/emis/{emi_id}/confirm-payment", headers=auth_headers)
    assert resp.status_code == 400


async def test_cannot_confirm_completed_emi(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _create_credit_card(client, auth_headers, due_day=5)
    yesterday = date.today() - timedelta(days=1)
    create = await client.post(
        "/api/v1/finance/emis",
        headers=auth_headers,
        json={
            "account_id": card["account_id"],
            "name": "Almost done",
            "monthly_amount": "1000",
            "total_installments": 1,
            "due_day": 5,
            "start_date": yesterday.isoformat(),
        },
    )
    emi_id = create.json()["id"]

    first = await client.post(f"/api/v1/finance/emis/{emi_id}/confirm-payment", headers=auth_headers)
    assert first.json()["is_completed"] is True

    second = await client.post(f"/api/v1/finance/emis/{emi_id}/confirm-payment", headers=auth_headers)
    assert second.status_code == 400


async def test_confirm_emi_payment_rejects_other_users_emi(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    card = await _create_credit_card(client, auth_headers, due_day=5)
    yesterday = date.today() - timedelta(days=1)
    create = await client.post(
        "/api/v1/finance/emis",
        headers=auth_headers,
        json={
            "account_id": card["account_id"],
            "name": "iPhone EMI",
            "monthly_amount": "3500",
            "total_installments": 10,
            "due_day": 5,
            "start_date": yesterday.isoformat(),
        },
    )
    emi_id = create.json()["id"]

    await client.post("/api/v1/auth/register", json={"email": "emi-confirm-eve@example.com", "password": "correcthorsebattery"})
    eve_login = await client.post(
        "/api/v1/auth/login", json={"email": "emi-confirm-eve@example.com", "password": "correcthorsebattery"}
    )
    eve_headers = {"Authorization": f"Bearer {eve_login.json()['access_token']}"}

    resp = await client.post(f"/api/v1/finance/emis/{emi_id}/confirm-payment", headers=eve_headers)
    assert resp.status_code == 404


async def test_sip_generates_only_up_to_today(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    account = await client.post(
        "/api/v1/finance/accounts", headers=auth_headers, json={"name": "Bank", "account_type": "bank"}
    )
    account_id = account.json()["id"]
    last_month = date.today().replace(day=1) - timedelta(days=1)

    await client.post(
        "/api/v1/finance/sips",
        headers=auth_headers,
        json={
            "account_id": account_id,
            "name": "Index Fund",
            "amount": "5000",
            "due_day": last_month.day,
            "start_date": last_month.isoformat(),
        },
    )
    sips = await client.get("/api/v1/finance/sips", headers=auth_headers)
    sip = sips.json()[0]
    assert date.fromisoformat(sip["next_due_date"]) > date.today()

    txns = await client.get("/api/v1/finance/transactions", headers=auth_headers)
    sip_txns = [t for t in txns.json() if "SIP: Index Fund" in (t["note"] or "")]
    assert all(date.fromisoformat(t["occurred_on"]) <= date.today() for t in sip_txns)


async def test_lending_reminder_requires_phone_number(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Arjun", "direction": "lent", "amount": "2000"},
    )
    lending_id = create.json()["id"]

    resp = await client.get(f"/api/v1/finance/lendings/{lending_id}/reminder", headers=auth_headers)
    assert resp.status_code == 400


async def test_lending_reminder_links_use_digits_only_number(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={
            "person_name": "Arjun",
            "phone_number": "+91 98765 43210",
            "direction": "lent",
            "amount": "2000",
        },
    )
    lending_id = create.json()["id"]

    resp = await client.get(f"/api/v1/finance/lendings/{lending_id}/reminder", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["sms_link"].startswith("sms:919876543210?body=")
    assert body["whatsapp_link"].startswith("https://wa.me/919876543210?text=")


async def test_lending_settle_and_cannot_touch_others(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create = await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Priya", "direction": "borrowed", "amount": "1000"},
    )
    lending_id = create.json()["id"]

    settle = await client.post(f"/api/v1/finance/lendings/{lending_id}/settle", headers=auth_headers)
    assert settle.status_code == 200
    assert settle.json()["is_settled"] is True

    await client.post("/api/v1/auth/register", json={"email": "eve2@example.com", "password": "correcthorsebattery"})
    eve_login = await client.post(
        "/api/v1/auth/login", json={"email": "eve2@example.com", "password": "correcthorsebattery"}
    )
    eve_headers = {"Authorization": f"Bearer {eve_login.json()['access_token']}"}

    forbidden = await client.post(f"/api/v1/finance/lendings/{lending_id}/settle", headers=eve_headers)
    assert forbidden.status_code == 404

    eve_lendings = await client.get("/api/v1/finance/lendings", headers=eve_headers)
    assert eve_lendings.json() == []
