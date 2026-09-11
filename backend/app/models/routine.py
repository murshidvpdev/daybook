import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class Routine(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "routines"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    time_of_day: Mapped[str] = mapped_column(String(20), default="morning")  # morning | evening | anytime
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    items: Mapped[list["RoutineItem"]] = relationship(back_populates="routine", cascade="all, delete-orphan")


class RoutineItem(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "routine_items"

    routine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("routines.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(150))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    routine: Mapped[Routine] = relationship(back_populates="items")
    completions: Mapped[list["RoutineCompletion"]] = relationship(
        back_populates="item", cascade="all, delete-orphan"
    )


class RoutineCompletion(Base, UUIDPKMixin):
    __tablename__ = "routine_completions"
    __table_args__ = (UniqueConstraint("routine_item_id", "completed_on", name="uq_routine_item_day"),)

    routine_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("routine_items.id", ondelete="CASCADE"), index=True
    )
    completed_on: Mapped[date] = mapped_column(Date, index=True)

    item: Mapped[RoutineItem] = relationship(back_populates="completions")
