from datetime import date
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import finance as finance_service
from app.services import fitness as fitness_service
from app.services import habit as habit_service
from app.services import routine as routine_service


async def get_today_summary(db: AsyncSession, user_id: UUID) -> dict:
    """One aggregation point over the domain services — the dashboard owns no tables
    of its own, only the composition of what the other services already compute."""
    today = date.today()

    routines = await routine_service.list_routines(db, user_id)
    routine_items = [item for r in routines for item in r.items]
    routine_completed = sum(
        1 for item in routine_items if any(c.completed_on == today for c in item.completions)
    )

    habits = await habit_service.list_habits(db, user_id)
    habit_completed = sum(
        1 for h in habits if any(c.completed_on == today for c in h.completions)
    )

    spent_today = await finance_service.spent_on(db, user_id, today)
    last_workout = await fitness_service.last_session_date(db, user_id)

    return {
        "date": today.isoformat(),
        "routines": {"completed": routine_completed, "total": len(routine_items)},
        "habits": {"completed": habit_completed, "total": len(habits)},
        "finance": {"spent_today": spent_today, "currency": "INR"},
        "fitness": {
            "last_workout_on": last_workout.isoformat() if last_workout else None,
            "logged_today": last_workout == today if last_workout else False,
        },
    }
