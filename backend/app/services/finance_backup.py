"""Backing up a user's money data, and wiping it to start over.

Start fresh is for when the books have drifted too far to fix entry by entry:
the user downloads a backup, clears accounts/cards/transactions, and re-enters
today's real balances. Lendings are deliberately kept — who owes you what
doesn't change because your account history was messy — and only lose their
link to the old transactions (the foreign keys are SET NULL).
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.capture import SmsCapture
from app.models.finance import (
    EMI,
    SIP,
    CreditCard,
    CreditCardBill,
    FinancialAccount,
    Lending,
    LendingPayment,
    Transaction,
    TransactionCategory,
)
from app.models.user import User

BACKUP_VERSION = 1

# Everything money-related a user owns, in the order a restore would need them.
_TABLES = [
    ("accounts", FinancialAccount),
    ("credit_cards", CreditCard),
    ("categories", TransactionCategory),
    ("transactions", Transaction),
    ("credit_card_bills", CreditCardBill),
    ("emis", EMI),
    ("sips", SIP),
    ("lendings", Lending),
    ("lending_payments", LendingPayment),
]


def _jsonable(value: object) -> object:
    if isinstance(value, UUID | Decimal):
        return str(value)
    if isinstance(value, date | datetime):
        return value.isoformat()
    return value


async def export_finance(db: AsyncSession, user_id: UUID) -> dict:
    user = await db.get(User, user_id)
    out: dict = {
        "daybook_backup_version": BACKUP_VERSION,
        "exported_at": datetime.now(UTC).isoformat(),
        "email": user.email if user else None,
    }
    for name, model in _TABLES:
        rows = (await db.scalars(select(model).where(model.user_id == user_id))).all()
        columns = [c.name for c in model.__table__.columns]
        out[name] = [{c: _jsonable(getattr(row, c)) for c in columns} for row in rows]
    return out


async def start_fresh(db: AsyncSession, user_id: UUID) -> None:
    """Deletes accounts, cards and everything hanging off them — transactions,
    bills, EMIs, SIPs, captured SMS. Keeps lendings (and their repayments) and
    categories. One transaction: it all goes, or none of it does."""
    for model in (SmsCapture, CreditCardBill, EMI, SIP, CreditCard, Transaction, FinancialAccount):
        await db.execute(delete(model).where(model.user_id == user_id))
    await db.commit()
