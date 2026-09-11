"""Due-date math shared by credit cards, EMIs, and SIPs. SIPs still
auto-generate their transaction the next time a finance endpoint is hit
(a NACH-style auto-debit doesn't wait for confirmation in real life either).
EMIs deliberately don't — see services/finance.py:confirm_emi_payment — since
whether an EMI installment actually went through is exactly the kind of thing
that shouldn't be assumed silently.
"""

import calendar
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import SIP, Transaction


def clamp_day_to_month(year: int, month: int, day: int) -> int:
    """Day 31 in a 30-day month becomes that month's last day — the same rule
    every card issuer and bank already applies to a fixed due-day-of-month."""
    last_day = calendar.monthrange(year, month)[1]
    return min(day, last_day)


def compute_next_due_date(due_day: int, from_date: date | None = None) -> date:
    """The next occurrence of `due_day` on/after `from_date` (today by default)."""
    if not 1 <= due_day <= 31:
        raise ValueError("due_day must be between 1 and 31")
    today = from_date or date.today()
    candidate = date(today.year, today.month, clamp_day_to_month(today.year, today.month, due_day))
    if candidate < today:
        year, month = (today.year, today.month + 1) if today.month < 12 else (today.year + 1, 1)
        candidate = date(year, month, clamp_day_to_month(year, month, due_day))
    return candidate


def advance_one_month(due_day: int, from_date: date) -> date:
    """The due date one cycle after `from_date` — used once a cycle's charge has
    been generated, so the same date is never generated twice."""
    year, month = (from_date.year, from_date.month + 1) if from_date.month < 12 else (from_date.year + 1, 1)
    return date(year, month, clamp_day_to_month(year, month, due_day))


async def sync_due_sips(db: AsyncSession, user_id: uuid.UUID) -> None:
    today = date.today()
    sips = (
        await db.scalars(
            select(SIP).where(SIP.user_id == user_id, SIP.is_active.is_(True), SIP.next_due_date <= today)
        )
    ).all()
    for sip in sips:
        while sip.next_due_date <= today:
            db.add(
                Transaction(
                    user_id=user_id,
                    account_id=sip.account_id,
                    kind="expense",
                    amount=sip.amount,
                    note=f"SIP: {sip.name}",
                    occurred_on=sip.next_due_date,
                )
            )
            sip.next_due_date = advance_one_month(sip.due_day, sip.next_due_date)
    if sips:
        await db.commit()
