import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class Habit(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "habits"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    cadence: Mapped[str] = mapped_column(String(20), default="daily")  # daily | weekly
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    completions: Mapped[list["HabitCompletion"]] = relationship(
        back_populates="habit", cascade="all, delete-orphan"
    )


class HabitCompletion(Base, UUIDPKMixin):
    __tablename__ = "habit_completions"
    __table_args__ = (UniqueConstraint("habit_id", "completed_on", name="uq_habit_day"),)

    habit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"), index=True)
    completed_on: Mapped[date] = mapped_column(Date, index=True)

    habit: Mapped[Habit] = relationship(back_populates="completions")
