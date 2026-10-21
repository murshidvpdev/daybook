from datetime import date

from httpx import AsyncClient


async def _bank(client: AsyncClient, headers: dict[str, str], name: str = "SBI", opening: str = "10000") -> str:
    resp = await client.post(
        "/api/v1/finance/accounts",
        headers=headers,
        json={"name": name, "account_type": "bank", "opening_balance": opening},
    )
    return resp.json()["id"]


async def _card(client: AsyncClient, headers: dict[str, str]) -> dict:
    resp = await client.post(
        "/api/v1/finance/credit-cards",
        headers=headers,
        json={"name": "HDFC Regalia", "credit_limit": "100000", "due_day": 5, "opening_balance": "5000"},
    )
    return resp.json()


async def test_check_balances_trues_up_every_account_in_one_go(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    bank = await _bank(client, auth_headers)
    cash = await _bank(client, auth_headers, name="Wallet", opening="2000")
    card = await _card(client, auth_headers)

    resp = await client.post(
        "/api/v1/finance/accounts/check-balances",
        headers=auth_headers,
        json={
            "entries": [
                {"account_id": bank, "actual": "8500"},  # unlogged spends
                {"account_id": cash, "actual": "2000"},  # already right
                {"account_id": card["account_id"], "actual": "7250", "credit_limit": "120000"},
            ]
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["adjusted"] == 2
    today = date.today().isoformat()
    assert all(a["last_checked_on"] == today for a in body["accounts"])

    accounts = {a["id"]: a for a in (await client.get("/api/v1/finance/accounts", headers=auth_headers)).json()}
    assert float(accounts[bank]["current_balance"]) == 8500
    assert float(accounts[cash]["current_balance"]) == 2000

    cards = (await client.get("/api/v1/finance/credit-cards", headers=auth_headers)).json()
    assert float(cards[0]["outstanding_balance"]) == 7250
    assert float(cards[0]["credit_limit"]) == 120000
    assert cards[0]["last_checked_on"] == today

    # The missed spends count as spending, like they really were
    txns = (await client.get("/api/v1/finance/transactions", headers=auth_headers)).json()
    checks = [t for t in txns if t["note"] == "Balance check"]
    assert sorted((t["kind"], float(t["amount"])) for t in checks) == [("expense", 1500), ("expense", 2250)]


async def test_check_balances_rejects_duplicates_and_limits_on_bank_accounts(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    bank = await _bank(client, auth_headers)
    dup = await client.post(
        "/api/v1/finance/accounts/check-balances",
        headers=auth_headers,
        json={"entries": [{"account_id": bank, "actual": "1"}, {"account_id": bank, "actual": "2"}]},
    )
    assert dup.status_code == 400

    limit = await client.post(
        "/api/v1/finance/accounts/check-balances",
        headers=auth_headers,
        json={"entries": [{"account_id": bank, "actual": "1", "credit_limit": "5000"}]},
    )
    assert limit.status_code == 400
    # Nothing was half-applied
    accounts = (await client.get("/api/v1/finance/accounts", headers=auth_headers)).json()
    assert float(accounts[0]["current_balance"]) == 10000
    assert accounts[0]["last_checked_on"] is None


async def test_check_balances_cannot_touch_another_users_account(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await client.post("/api/v1/auth/register", json={"email": "check-eve@example.com", "password": "correcthorsebattery"})
    eve_login = await client.post(
        "/api/v1/auth/login", json={"email": "check-eve@example.com", "password": "correcthorsebattery"}
    )
    eve_headers = {"Authorization": f"Bearer {eve_login.json()['access_token']}"}
    eve_bank = await _bank(client, eve_headers)

    resp = await client.post(
        "/api/v1/finance/accounts/check-balances",
        headers=auth_headers,
        json={"entries": [{"account_id": eve_bank, "actual": "0"}]},
    )
    assert resp.status_code == 404


async def test_single_adjust_and_match_statement_also_mark_checked(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    bank = await _bank(client, auth_headers)
    card = await _card(client, auth_headers)
    adjusted = await client.post(
        f"/api/v1/finance/accounts/{bank}/adjust-balance", headers=auth_headers, json={"actual_balance": "9000"}
    )
    assert adjusted.json()["last_checked_on"] == date.today().isoformat()
    matched = await client.post(
        f"/api/v1/finance/credit-cards/{card['id']}/match-statement",
        headers=auth_headers,
        json={"actual_outstanding": "5000"},
    )
    assert matched.json()["last_checked_on"] == date.today().isoformat()
