"""Lendings grouped by person.

Lendings are stored one per occasion — a friend who borrowed twice is two
rows — and older rows often have only a name, no phone. A person here is
keyed by phone number (last 10 digits) when known; a name-only lending joins
the phone-keyed person with the same name, so linking a contact to one
lending pulls that friend's whole history together.
"""

import re
from collections import defaultdict
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.finance import Lending
from app.schemas.finance import PersonUpdate
from app.services.finance import FinanceNotFound, FinanceValidationError
from app.services.reminder import build_person_reminder_message, links_for


def phone_key(phone: str | None) -> str | None:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-10:] if len(digits) >= 6 else None


def _name_key(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().lower()


def _group(lendings: list[Lending]) -> dict[str, list[Lending]]:
    phones_by_name: dict[str, set[str]] = defaultdict(set)
    for lending in lendings:
        if key := phone_key(lending.phone_number):
            phones_by_name[_name_key(lending.person_name)].add(key)

    groups: dict[str, list[Lending]] = defaultdict(list)
    for lending in lendings:
        key = phone_key(lending.phone_number)
        if key is None:
            phones = phones_by_name.get(_name_key(lending.person_name), set())
            # Only when the name points at exactly one number — two different
            # friends called "Arjun" must stay apart.
            key = next(iter(phones)) if len(phones) == 1 else None
        groups[f"tel:{key}" if key else f"name:{_name_key(lending.person_name)}"].append(lending)
    return groups


async def _all(db: AsyncSession, user_id: UUID) -> list[Lending]:
    result = await db.scalars(
        select(Lending).options(selectinload(Lending.payments)).where(Lending.user_id == user_id)
    )
    return list(result.all())


def _paid(lending: Lending) -> Decimal:
    return sum((Decimal(str(p.amount)) for p in lending.payments), Decimal(0))


async def list_people(db: AsyncSession, user_id: UUID) -> list[dict]:
    people = []
    for key, rows in _group(await _all(db, user_id)).items():
        latest = max(rows, key=lambda r: r.given_on)
        with_phone = [r for r in rows if r.phone_number]
        summary = {
            "key": key,
            "person_name": latest.person_name,
            "phone_number": max(with_phone, key=lambda r: r.given_on).phone_number if with_phone else None,
            "times": len(rows),
            "open_count": sum(1 for r in rows if not r.is_settled),
            "last_given_on": latest.given_on,
            "lending_ids": [r.id for r in rows],
        }
        for direction in ("lent", "borrowed"):
            mine = [r for r in rows if r.direction == direction]
            total = sum((Decimal(str(r.amount)) for r in mine), Decimal(0))
            repaid = sum((_paid(r) for r in mine), Decimal(0))
            # A settled lending owes nothing even if it was closed without payments.
            outstanding = sum(
                (Decimal(str(r.amount)) - _paid(r) for r in mine if not r.is_settled), Decimal(0)
            )
            summary[f"{direction}_total"] = total
            summary[f"{direction}_repaid"] = repaid
            summary[f"{direction}_outstanding"] = outstanding
        people.append(summary)
    # Whoever owes you the most first, then most recent.
    people.sort(key=lambda p: (-p["lent_outstanding"], -p["borrowed_outstanding"], date.max - p["last_given_on"]))
    return people


async def update_person(db: AsyncSession, user_id: UUID, data: PersonUpdate) -> list[dict]:
    """Renames / links a contact to every lending of one person at once — how
    old name-only history gets its phone number."""
    rows = _group(await _all(db, user_id)).get(data.key)
    if not rows:
        raise FinanceNotFound("Person not found")
    name = data.person_name.strip()
    if not name:
        raise FinanceValidationError("Name can't be empty")
    for lending in rows:
        lending.person_name = name[:120]
        lending.phone_number = (data.phone_number or "").strip()[:20] or None
    await db.commit()
    return await list_people(db, user_id)


async def person_reminder(db: AsyncSession, user_id: UUID, key: str) -> dict | None:
    rows = _group(await _all(db, user_id)).get(key)
    if not rows:
        raise FinanceNotFound("Person not found")
    latest = max(rows, key=lambda r: r.given_on)
    with_phone = [r for r in rows if r.phone_number]
    phone = max(with_phone, key=lambda r: r.given_on).phone_number if with_phone else None
    return links_for(phone, build_person_reminder_message(latest.person_name, rows))
