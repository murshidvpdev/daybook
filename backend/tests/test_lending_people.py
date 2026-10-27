from httpx import AsyncClient


async def _lend(client: AsyncClient, headers: dict[str, str], name: str, amount: str, **extra) -> dict:
    resp = await client.post(
        "/api/v1/finance/lendings",
        headers=headers,
        json={"person_name": name, "direction": "lent", "amount": amount, **extra},
    )
    assert resp.status_code == 201
    return resp.json()


async def _people(client: AsyncClient, headers: dict[str, str]) -> list[dict]:
    resp = await client.get("/api/v1/finance/lendings/people", headers=headers)
    assert resp.status_code == 200
    return resp.json()


async def test_one_row_per_person_across_every_time(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    first = await _lend(client, auth_headers, "Arjun", "5000")
    await _lend(client, auth_headers, "arjun ", "3000")  # same name, typed differently
    await _lend(client, auth_headers, "Ravi", "1000")
    await client.post(f"/api/v1/finance/lendings/{first['id']}/payments", headers=auth_headers, json={"amount": "2000"})

    people = await _people(client, auth_headers)
    assert [p["person_name"].strip().lower() for p in people] == ["arjun", "ravi"]
    arjun = people[0]
    assert arjun["times"] == 2 and arjun["open_count"] == 2
    assert float(arjun["lent_total"]) == 8000
    assert float(arjun["lent_repaid"]) == 2000
    assert float(arjun["lent_outstanding"]) == 6000


async def test_phone_number_ties_history_together(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await _lend(client, auth_headers, "Arjun", "5000")  # old entry, name only
    await _lend(client, auth_headers, "Arjun K", "2000", phone_number="+91 98765 43210")
    await _lend(client, auth_headers, "Arjun", "1000", phone_number="9876543210")

    people = await _people(client, auth_headers)
    # "Arjun K" and "Arjun" share a number -> one person; the name-only "Arjun"
    # joins them because that name points at exactly one number.
    assert len(people) == 1
    assert people[0]["times"] == 3 and float(people[0]["lent_outstanding"]) == 8000


async def test_linking_a_contact_updates_every_old_lending(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await _lend(client, auth_headers, "Shahida", "1000")
    await _lend(client, auth_headers, "shahida", "500")
    key = (await _people(client, auth_headers))[0]["key"]

    resp = await client.put(
        "/api/v1/finance/lendings/people",
        headers=auth_headers,
        json={"key": key, "person_name": "Shahida K", "phone_number": "+91 90000 11111"},
    )
    assert resp.status_code == 200
    people = resp.json()
    assert len(people) == 1
    assert people[0]["person_name"] == "Shahida K" and people[0]["phone_number"] == "+91 90000 11111"
    lendings = (await client.get("/api/v1/finance/lendings", headers=auth_headers)).json()
    assert {(lend["person_name"], lend["phone_number"]) for lend in lendings} == {("Shahida K", "+91 90000 11111")}

    # A new lending with the same number lands on the same person
    await _lend(client, auth_headers, "Shahida", "200", phone_number="9000011111")
    people = await _people(client, auth_headers)
    assert len(people) == 1 and people[0]["times"] == 3


async def test_settled_and_borrowed_are_counted_separately(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    done = await _lend(client, auth_headers, "Ravi", "1000")
    await client.post(f"/api/v1/finance/lendings/{done['id']}/settle", headers=auth_headers)
    await client.post(
        "/api/v1/finance/lendings",
        headers=auth_headers,
        json={"person_name": "Ravi", "direction": "borrowed", "amount": "400"},
    )
    ravi = (await _people(client, auth_headers))[0]
    assert float(ravi["lent_outstanding"]) == 0 and ravi["open_count"] == 1
    assert float(ravi["borrowed_outstanding"]) == 400


async def test_people_are_private_and_unknown_key_is_404(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await _lend(client, auth_headers, "Arjun", "100")
    await client.post("/api/v1/auth/register", json={"email": "people-eve@example.com", "password": "correcthorsebattery"})
    login = await client.post(
        "/api/v1/auth/login", json={"email": "people-eve@example.com", "password": "correcthorsebattery"}
    )
    eve = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert await _people(client, eve) == []
    resp = await client.put(
        "/api/v1/finance/lendings/people", headers=eve, json={"key": "name:arjun", "person_name": "Hacked"}
    )
    assert resp.status_code == 404
    assert (await _people(client, auth_headers))[0]["person_name"] == "Arjun"


async def test_reminder_asks_only_for_what_is_left(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    lending = await _lend(client, auth_headers, "Arjun", "5000", phone_number="98765 43210")
    await client.post(
        f"/api/v1/finance/lendings/{lending['id']}/payments", headers=auth_headers, json={"amount": "2000"}
    )
    resp = await client.get(f"/api/v1/finance/lendings/{lending['id']}/reminder", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "₹3,000 is still pending" in body["message"]
    assert "₹2,000 already" in body["message"]
    # A bare 10-digit number gets India's country code for WhatsApp
    assert body["whatsapp_link"].startswith("https://wa.me/919876543210?text=")


async def test_person_reminder_totals_every_open_lending(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    first = await _lend(client, auth_headers, "Arjun", "5000", phone_number="+91 98765 43210")
    await _lend(client, auth_headers, "Arjun", "3000")  # older-style entry without a number
    settled = await _lend(client, auth_headers, "Arjun", "700", phone_number="9876543210")
    await client.post(f"/api/v1/finance/lendings/{settled['id']}/settle", headers=auth_headers)
    await client.post(f"/api/v1/finance/lendings/{first['id']}/payments", headers=auth_headers, json={"amount": "1000"})

    key = (await _people(client, auth_headers))[0]["key"]
    resp = await client.get("/api/v1/finance/lendings/people/reminder", params={"key": key}, headers=auth_headers)
    assert resp.status_code == 200
    message = resp.json()["message"]
    assert "₹7,000 is still pending in total" in message  # 5000 - 1000 + 3000; the settled 700 is left out
    assert "₹1,000 back already" in message


async def test_person_reminder_needs_a_number_and_something_owed(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await _lend(client, auth_headers, "Ravi", "100")
    key = (await _people(client, auth_headers))[0]["key"]
    resp = await client.get("/api/v1/finance/lendings/people/reminder", params={"key": key}, headers=auth_headers)
    assert resp.status_code == 400
