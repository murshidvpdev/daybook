"""SMS capture: the phone posts each bank SMS here, and it waits for review.

See models/capture.py for why nothing is booked automatically, and
services/sms_parser.py for how the SMS is read.
"""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_refresh_token, hash_refresh_token
from app.models.capture import SmsCapture, SmsCaptureKey
from app.models.finance import CreditCard, FinancialAccount
from app.schemas.capture import SmsCaptureConfirm
from app.schemas.finance import (
    CreditCardMoneyIn,
    CreditCardSpendCreate,
    LendingCreate,
    LendingPaymentCreate,
    TransactionCreate,
)
from app.services import finance
from app.services.finance import FinanceNotFound, FinanceValidationError
from app.services.sms_parser import parse_bank_sms


class InvalidCaptureKey(Exception):
    pass


async def key_status(db: AsyncSession, user_id: UUID) -> dict:
    key = await db.scalar(select(SmsCaptureKey).where(SmsCaptureKey.user_id == user_id))
    pending = await db.scalar(
        select(func.count(SmsCapture.id)).where(SmsCapture.user_id == user_id, SmsCapture.status == "pending")
    )
    return {"enabled": key is not None, "last_used_at": key.last_used_at if key else None, "pending_count": pending}


async def create_key(db: AsyncSession, user_id: UUID) -> str:
    """Issues a fresh key, replacing any old one — so this is also how a key
    that leaked (or a lost phone) gets revoked."""
    raw = generate_refresh_token()
    key = await db.scalar(select(SmsCaptureKey).where(SmsCaptureKey.user_id == user_id))
    if key is None:
        db.add(SmsCaptureKey(user_id=user_id, key_hash=hash_refresh_token(raw)))
    else:
        key.key_hash = hash_refresh_token(raw)
        key.last_used_at = None
    await db.commit()
    return raw


async def delete_key(db: AsyncSession, user_id: UUID) -> None:
    key = await db.scalar(select(SmsCaptureKey).where(SmsCaptureKey.user_id == user_id))
    if key is not None:
        await db.delete(key)
        await db.commit()


async def _match_account(db: AsyncSession, user_id: UUID, last_four: str | None) -> UUID | None:
    """The one account whose number ends in these digits — none if it's
    ambiguous, since a wrong guess is worse than asking."""
    if not last_four:
        return None
    card_accounts = await db.scalars(
        select(CreditCard.account_id).where(
            CreditCard.user_id == user_id, CreditCard.last_four.is_not(None), CreditCard.last_four.endswith(last_four)
        )
    )
    bank_accounts = await db.scalars(
        select(FinancialAccount.id).where(
            FinancialAccount.user_id == user_id,
            FinancialAccount.last_four.is_not(None),
            FinancialAccount.last_four.endswith(last_four),
        )
    )
    matches = {*card_accounts.all(), *bank_accounts.all()}
    return matches.pop() if len(matches) == 1 else None


async def ingest(db: AsyncSession, raw_key: str, text: str, sender: str | None) -> str:
    key = await db.scalar(select(SmsCaptureKey).where(SmsCaptureKey.key_hash == hash_refresh_token(raw_key)))
    if key is None:
        raise InvalidCaptureKey()
    key.last_used_at = datetime.now(UTC)

    parsed = parse_bank_sms(text)
    if not parsed.is_transaction:
        await db.commit()
        return "ignored"
    if parsed.reference is not None:
        same = SmsCapture.reference == parsed.reference
    else:
        # No reference to go on (card SMS often have none): the same text again
        # within minutes is one SMS that set off two phone automations.
        same = (SmsCapture.raw_text == text[:2000]) & (
            SmsCapture.created_at >= datetime.now(UTC) - timedelta(minutes=10)
        )
    if await db.scalar(select(SmsCapture.id).where(SmsCapture.user_id == key.user_id, same).limit(1)):
        await db.commit()
        return "duplicate"

    db.add(
        SmsCapture(
            user_id=key.user_id,
            raw_text=text[:2000],
            sender=sender[:64] if sender else None,
            amount=parsed.amount,
            kind=parsed.kind,
            last_four=parsed.last_four,
            counterparty=parsed.counterparty,
            reference=parsed.reference,
            occurred_on=date.today(),
            account_id=await _match_account(db, key.user_id, parsed.last_four),
        )
    )
    await db.commit()
    return "captured"


async def list_pending(db: AsyncSession, user_id: UUID) -> list[SmsCapture]:
    result = await db.scalars(
        select(SmsCapture)
        .where(SmsCapture.user_id == user_id, SmsCapture.status == "pending")
        .order_by(SmsCapture.created_at.desc())
    )
    return list(result.all())


async def _get_pending(db: AsyncSession, user_id: UUID, capture_id: UUID) -> SmsCapture:
    capture = await db.scalar(
        select(SmsCapture).where(
            SmsCapture.id == capture_id, SmsCapture.user_id == user_id, SmsCapture.status == "pending"
        )
    )
    if capture is None:
        raise FinanceNotFound("Captured SMS not found (or already handled)")
    return capture


async def confirm(db: AsyncSession, user_id: UUID, capture_id: UUID, data: SmsCaptureConfirm) -> None:
    capture = await _get_pending(db, user_id, capture_id)
    if data.amount <= 0:
        raise FinanceValidationError("Amount must be positive")
    if sum(x is not None for x in (data.lend, data.lending_id, data.pay_card_id)) > 1:
        raise FinanceValidationError("Choose only one of: new lending, repayment, card bill payment")
    occurred_on = data.occurred_on or capture.occurred_on
    note = data.note or capture.counterparty
    # Marked booked before the finance call below, whose own commit then
    # persists both together — so a capture can't be booked twice.
    capture.status = "booked"

    if data.pay_card_id is not None:
        card = await db.scalar(
            select(CreditCard).where(CreditCard.id == data.pay_card_id, CreditCard.user_id == user_id)
        )
        if card is None:
            raise FinanceNotFound("Credit card not found")
        from_account_id = None if data.account_id == card.account_id else data.account_id
        txn = await finance.card_money_in(
            db,
            user_id,
            card.id,
            CreditCardMoneyIn(
                amount=data.amount,
                source="payment",
                from_account_id=from_account_id,
                occurred_on=occurred_on,
                note=data.note or "Card payment",
            ),
        )
        transaction_id = txn.id
    elif data.lending_id is not None:
        lending = await finance.add_lending_payment(
            db,
            user_id,
            data.lending_id,
            LendingPaymentCreate(amount=data.amount, paid_on=occurred_on, account_id=data.account_id, note=data.note),
        )
        transaction_id = lending["payments"][-1]["transaction_id"] if lending["payments"] else None
    elif data.lend is not None:
        card = await db.scalar(
            select(CreditCard).where(CreditCard.account_id == data.account_id, CreditCard.user_id == user_id)
        )
        if card is not None and data.kind == "expense":
            txn, _ = await finance.spend_on_credit_card(
                db,
                user_id,
                card.id,
                CreditCardSpendCreate(amount=data.amount, note=note, occurred_on=occurred_on, lend=data.lend),
            )
            transaction_id = txn.id
        else:
            lending = await finance.create_lending(
                db,
                user_id,
                LendingCreate(
                    person_name=data.lend.person_name,
                    phone_number=data.lend.phone_number,
                    remind_on=data.lend.remind_on,
                    direction="lent" if data.kind == "expense" else "borrowed",
                    amount=data.amount,
                    given_on=occurred_on,
                    note=data.note,
                    account_id=data.account_id,
                ),
            )
            transaction_id = lending["transaction_id"]
    else:
        txn = await finance.create_transaction(
            db,
            user_id,
            TransactionCreate(
                account_id=data.account_id,
                category_id=data.category_id,
                kind=data.kind,
                amount=data.amount,
                note=note,
                occurred_on=occurred_on,
            ),
        )
        transaction_id = txn.id

    capture.transaction_id = transaction_id
    capture.account_id = data.account_id
    await db.commit()


async def dismiss(db: AsyncSession, user_id: UUID, capture_id: UUID) -> None:
    capture = await _get_pending(db, user_id, capture_id)
    capture.status = "dismissed"
    await db.commit()
