from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password, verify_password
from app.models.admin import AdminUser
from app.models.finance import Transaction
from app.models.fitness import WorkoutSession
from app.models.habit import Habit
from app.models.routine import Routine
from app.models.user import User, UserSession
from app.services.finance import finance_summary, list_transactions


class AdminAuthError(Exception):
    pass


class AdminUserNotFound(Exception):
    pass


async def authenticate_admin(db: AsyncSession, email: str, password: str) -> AdminUser:
    admin = await db.scalar(select(AdminUser).where(AdminUser.email == email))
    if admin is None or not verify_password(password, admin.hashed_password):
        raise AdminAuthError("Incorrect email or password")
    return admin


def _day_bounds(days_ago: int) -> datetime:
    return datetime.now(UTC) - timedelta(days=days_ago)


async def _active_user_ids_since(db: AsyncSession, since: datetime) -> set[UUID]:
    """A session row is created on every login *and* every refresh-token
    rotation, so this is "made an authenticated request since", not just
    "logged in" — a good enough proxy for "actually used the app"."""
    rows = await db.execute(select(UserSession.user_id).where(UserSession.created_at >= since).distinct())
    return {row[0] for row in rows.all()}


async def get_stats(db: AsyncSession) -> dict:
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    total_users = await db.scalar(select(func.count()).select_from(User))
    new_today = await db.scalar(select(func.count()).select_from(User).where(User.created_at >= today_start))
    new_week = await db.scalar(select(func.count()).select_from(User).where(User.created_at >= week_start))
    active_today = await _active_user_ids_since(db, today_start)
    active_week = await _active_user_ids_since(db, week_start)

    return {
        "total_users": total_users or 0,
        "new_users_today": new_today or 0,
        "new_users_this_week": new_week or 0,
        "active_users_today": len(active_today),
        "active_users_this_week": len(active_week),
    }


async def list_users(db: AsyncSession) -> list[dict]:
    users = (await db.scalars(select(User).order_by(User.created_at.desc()))).all()

    txn_counts = dict(
        (
            await db.execute(select(Transaction.user_id, func.count()).group_by(Transaction.user_id))
        ).all()
    )
    routine_counts = dict((await db.execute(select(Routine.user_id, func.count()).group_by(Routine.user_id))).all())
    habit_counts = dict((await db.execute(select(Habit.user_id, func.count()).group_by(Habit.user_id))).all())
    workout_counts = dict(
        (await db.execute(select(WorkoutSession.user_id, func.count()).group_by(WorkoutSession.user_id))).all()
    )
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    active_today_ids = await _active_user_ids_since(db, today_start)

    return [
        {
            "id": u.id,
            "email": u.email,
            "display_name": u.display_name,
            "created_at": u.created_at,
            "is_active": u.is_active,
            "active_today": u.id in active_today_ids,
            "transactions_count": txn_counts.get(u.id, 0),
            "routines_count": routine_counts.get(u.id, 0),
            "habits_count": habit_counts.get(u.id, 0),
            "workouts_count": workout_counts.get(u.id, 0),
        }
        for u in users
    ]


async def _get_user(db: AsyncSession, user_id: UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise AdminUserNotFound("User not found")
    return user


async def get_user_detail(db: AsyncSession, user_id: UUID) -> dict:
    user = await _get_user(db, user_id)

    routines = (
        await db.scalars(
            select(Routine).options(selectinload(Routine.items)).where(Routine.user_id == user_id)
        )
    ).all()
    habits = (await db.scalars(select(Habit).where(Habit.user_id == user_id))).all()
    workouts = (
        await db.scalars(
            select(WorkoutSession)
            .where(WorkoutSession.user_id == user_id)
            .order_by(WorkoutSession.performed_on.desc())
            .limit(10)
        )
    ).all()
    recent_txns = await list_transactions(db, user_id, limit=10)
    summary = await finance_summary(db, user_id)

    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "created_at": user.created_at,
        "is_active": user.is_active,
        "finance": {
            "total_balance": summary["total_balance"],
            "net_worth": summary["net_worth"],
            "spent_this_month": summary["spent_this_month"],
            "income_this_month": summary["income_this_month"],
        },
        "recent_transactions": [
            {"id": t.id, "kind": t.kind, "amount": t.amount, "note": t.note, "occurred_on": t.occurred_on}
            for t in recent_txns
        ],
        "routines": [
            {"id": r.id, "name": r.name, "time_of_day": r.time_of_day, "item_count": len(r.items)}
            for r in routines
        ],
        "habits": [
            {"id": h.id, "name": h.name, "cadence": h.cadence, "is_archived": h.is_archived} for h in habits
        ],
        "recent_workouts": [
            {"id": w.id, "name": w.name, "performed_on": w.performed_on, "duration_minutes": w.duration_minutes}
            for w in workouts
        ],
    }


async def reset_user_password(db: AsyncSession, user_id: UUID, new_password: str) -> None:
    user = await _get_user(db, user_id)
    user.hashed_password = hash_password(new_password)
    # Force re-login everywhere — a password reset that leaves existing
    # sessions alive doesn't actually lock out whoever the reset was for.
    sessions = (await db.scalars(select(UserSession).where(UserSession.user_id == user_id))).all()
    for session in sessions:
        session.revoked_at = datetime.now(UTC)
    await db.commit()


async def set_user_active(db: AsyncSession, user_id: UUID, is_active: bool) -> None:
    user = await _get_user(db, user_id)
    user.is_active = is_active
    if not is_active:
        sessions = (await db.scalars(select(UserSession).where(UserSession.user_id == user_id))).all()
        for session in sessions:
            session.revoked_at = datetime.now(UTC)
    await db.commit()


async def delete_user(db: AsyncSession, user_id: UUID) -> None:
    user = await _get_user(db, user_id)
    await db.delete(user)  # cascades to every owned row across all domains
    await db.commit()
