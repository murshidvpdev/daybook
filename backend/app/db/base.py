import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from uuid6 import uuid7


class Base(DeclarativeBase):
    pass


class UUIDPKMixin:
    """UUIDv7 primary keys: time-ordered, so B-tree index locality stays good
    even at high insert volume (unlike UUIDv4, which scatters inserts randomly)."""

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
