from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.habit import Habit, HabitCompletion
from app.schemas.habit import HabitCreate


class HabitNotFound(Exception):
    pass


async def _get_owned(db: AsyncSession, user_id: UUID, habit_id: UUID) -> Habit:
    habit = await db.scalar(
        select(Habit)
        .options(selectinload(Habit.completions))
        .where(Habit.id == habit_id, Habit.user_id == user_id)
        .execution_options(populate_existing=True)
    )
    if habit is None:
        raise HabitNotFound()
    return habit


async def list_habits(db: AsyncSession, user_id: UUID) -> list[Habit]:
    result = await db.scalars(
        select(Habit)
        .options(selectinload(Habit.completions))
        .where(Habit.user_id == user_id, Habit.is_archived.is_(False))
        .order_by(Habit.created_at)
    )
    return list(result.all())


async def create_habit(db: AsyncSession, user_id: UUID, data: HabitCreate) -> Habit:
    habit = Habit(user_id=user_id, name=data.name, cadence=data.cadence)
    db.add(habit)
    await db.commit()
    return await _get_owned(db, user_id, habit.id)


async def archive_habit(db: AsyncSession, user_id: UUID, habit_id: UUID) -> None:
    habit = await _get_owned(db, user_id, habit_id)
    habit.is_archived = True
    await db.commit()


async def toggle_completion(db: AsyncSession, user_id: UUID, habit_id: UUID, on: date | None) -> Habit:
    habit = await _get_owned(db, user_id, habit_id)
    target_date = on or date.today()
    existing = next((c for c in habit.completions if c.completed_on == target_date), None)
    if existing is not None:
        await db.delete(existing)
    else:
        db.add(HabitCompletion(habit_id=habit.id, completed_on=target_date))
    await db.commit()
    return await _get_owned(db, user_id, habit_id)


def current_streak(habit: Habit) -> int:
    """Consecutive days ending today (or yesterday, if today isn't logged yet)."""
    done_dates = {c.completed_on for c in habit.completions}
    if not done_dates:
        return 0
    cursor = date.today()
    if cursor not in done_dates:
        cursor -= timedelta(days=1)
    streak = 0
    while cursor in done_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def to_out_dict(habit: Habit) -> dict:
    today = date.today()
    return {
        "id": habit.id,
        "name": habit.name,
        "cadence": habit.cadence,
        "is_archived": habit.is_archived,
        "completed_today": any(c.completed_on == today for c in habit.completions),
        "current_streak": current_streak(habit),
    }
