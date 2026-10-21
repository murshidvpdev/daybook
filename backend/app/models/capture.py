"""Transactions captured from bank SMS — see services/sms_capture.py.

The phone (an iOS Shortcuts automation or an Android SMS forwarder) posts each
bank SMS to a per-user capture URL. Nothing is booked straight away: each one
waits in a review list until the user confirms which account and category it
belongs to, so a misread SMS can never silently move a balance.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class SmsCaptureKey(Base, UUIDPKMixin, TimestampMixin):
    """One per user. Only the hash is stored — the raw key lives in the phone's
    automation, and making a new one replaces (and so revokes) the old."""

    __tablename__ = "sms_capture_keys"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SmsCapture(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "sms_captures"
    # The same SMS forwarded twice (or a retry) is one capture, not two.
    __table_args__ = (UniqueConstraint("user_id", "reference", name="uq_sms_captures_user_reference"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    raw_text: Mapped[str] = mapped_column(Text)
    sender: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # What the parser could read — any of these may be missing for an unusual format.
    amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    kind: Mapped[str | None] = mapped_column(String(10), nullable=True)  # expense | income
    last_four: Mapped[str | None] = mapped_column(String(4), nullable=True)
    counterparty: Mapped[str | None] = mapped_column(String(120), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(40), nullable=True)
    occurred_on: Mapped[date] = mapped_column(Date)
    # Best guess from last_four; the user can pick another when confirming.
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_accounts.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)  # pending | booked | dismissed
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
