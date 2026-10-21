from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.finance import LendPayload


class SmsIn(BaseModel):
    text: str
    sender: str | None = None


class SmsIngestResult(BaseModel):
    # captured: waiting for review · duplicate: already have this reference ·
    # ignored: not a completed transaction (an OTP, a reminder, a failed payment)
    status: Literal["captured", "duplicate", "ignored"]


class CaptureKeyStatus(BaseModel):
    enabled: bool
    last_used_at: datetime | None
    pending_count: int


class CaptureKeyCreated(BaseModel):
    key: str  # shown once — only its hash is kept


class SmsCaptureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    raw_text: str
    sender: str | None
    amount: Decimal | None
    kind: str | None
    last_four: str | None
    counterparty: str | None
    reference: str | None
    occurred_on: date
    account_id: UUID | None


class SmsCaptureConfirm(BaseModel):
    """Books a capture. By default that's a plain transaction; alternatively it
    can open a new lending (money you lent or borrowed) or be a repayment
    toward an existing one — the cases that matter most for friends."""

    account_id: UUID
    kind: Literal["expense", "income"]
    amount: Decimal
    occurred_on: date | None = None
    note: str | None = None
    category_id: UUID | None = None
    lend: LendPayload | None = None
    lending_id: UUID | None = None  # repayment toward this lending
    # A card bill payment — the card being paid. With account_id a bank account,
    # both balances move; with account_id the card itself (its "payment
    # received" SMS), only the card does. Either way it's a transfer, not spending.
    pay_card_id: UUID | None = None
