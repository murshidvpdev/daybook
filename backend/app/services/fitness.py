from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.fitness import Exercise, ExerciseSet, WorkoutSession
from app.schemas.fitness import ExerciseCreate, ExerciseSetCreate, WorkoutSessionCreate


class FitnessNotFound(Exception):
    pass


async def list_exercises(db: AsyncSession, user_id: UUID) -> list[Exercise]:
    result = await db.scalars(select(Exercise).where(Exercise.user_id == user_id))
    return list(result.all())


async def create_exercise(db: AsyncSession, user_id: UUID, data: ExerciseCreate) -> Exercise:
    exercise = Exercise(user_id=user_id, **data.model_dump())
    db.add(exercise)
    await db.commit()
    await db.refresh(exercise)
    return exercise


async def list_sessions(db: AsyncSession, user_id: UUID, limit: int = 30) -> list[WorkoutSession]:
    result = await db.scalars(
        select(WorkoutSession)
        .options(selectinload(WorkoutSession.sets))
        .where(WorkoutSession.user_id == user_id)
        .order_by(WorkoutSession.performed_on.desc())
        .limit(limit)
    )
    return list(result.all())


async def _get_owned_session(db: AsyncSession, user_id: UUID, session_id: UUID) -> WorkoutSession:
    session = await db.scalar(
        select(WorkoutSession)
        .options(selectinload(WorkoutSession.sets))
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user_id)
        .execution_options(populate_existing=True)
    )
    if session is None:
        raise FitnessNotFound("Workout session not found")
    return session


async def create_session(db: AsyncSession, user_id: UUID, data: WorkoutSessionCreate) -> WorkoutSession:
    session = WorkoutSession(
        user_id=user_id,
        name=data.name,
        performed_on=data.performed_on or date.today(),
        duration_minutes=data.duration_minutes,
        notes=data.notes,
    )
    db.add(session)
    await db.commit()
    return await _get_owned_session(db, user_id, session.id)


async def add_set(db: AsyncSession, user_id: UUID, session_id: UUID, data: ExerciseSetCreate) -> WorkoutSession:
    session = await _get_owned_session(db, user_id, session_id)
    exercise = await db.scalar(
        select(Exercise).where(Exercise.id == data.exercise_id, Exercise.user_id == user_id)
    )
    if exercise is None:
        raise FitnessNotFound("Exercise not found")

    db.add(
        ExerciseSet(
            session_id=session.id,
            exercise_id=data.exercise_id,
            set_number=data.set_number,
            reps=data.reps,
            weight_kg=data.weight_kg,
        )
    )
    await db.commit()
    return await _get_owned_session(db, user_id, session_id)


async def last_session_date(db: AsyncSession, user_id: UUID) -> date | None:
    return await db.scalar(
        select(WorkoutSession.performed_on)
        .where(WorkoutSession.user_id == user_id)
        .order_by(WorkoutSession.performed_on.desc())
        .limit(1)
    )
