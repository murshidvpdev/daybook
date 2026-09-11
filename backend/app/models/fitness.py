import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class Exercise(Base, UUIDPKMixin):
    """A small user-owned catalog rather than a shared global table — keeps ownership
    checks uniform with every other domain instead of carving out a public-data exception."""

    __tablename__ = "exercises"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    muscle_group: Mapped[str | None] = mapped_column(String(60), nullable=True)


class WorkoutSession(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "workout_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), default="Workout")
    performed_on: Mapped[date] = mapped_column(Date, index=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    sets: Mapped[list["ExerciseSet"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class ExerciseSet(Base, UUIDPKMixin):
    __tablename__ = "exercise_sets"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"))
    set_number: Mapped[int] = mapped_column(Integer, default=1)
    reps: Mapped[int] = mapped_column(Integer)
    weight_kg: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)

    session: Mapped[WorkoutSession] = relationship(back_populates="sets")
    exercise: Mapped[Exercise] = relationship()
