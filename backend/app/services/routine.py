from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.routine import Routine, RoutineCompletion, RoutineItem
from app.schemas.routine import RoutineCreate, RoutineItemCreate, RoutineItemUpdate, RoutineUpdate


class RoutineNotFound(Exception):
    pass


async def list_routines(db: AsyncSession, user_id: UUID) -> list[Routine]:
    result = await db.scalars(
        select(Routine)
        .options(selectinload(Routine.items).selectinload(RoutineItem.completions))
        .where(Routine.user_id == user_id)
        .order_by(Routine.sort_order)
    )
    return list(result.all())


async def _get_owned_routine(db: AsyncSession, user_id: UUID, routine_id: UUID) -> Routine:
    routine = await db.scalar(
        select(Routine)
        .options(selectinload(Routine.items).selectinload(RoutineItem.completions))
        .where(Routine.id == routine_id, Routine.user_id == user_id)
        .execution_options(populate_existing=True)
    )
    if routine is None:
        raise RoutineNotFound()
    return routine


async def create_routine(db: AsyncSession, user_id: UUID, data: RoutineCreate) -> Routine:
    routine = Routine(user_id=user_id, name=data.name, time_of_day=data.time_of_day)
    routine.items = [
        RoutineItem(title=item.title, sort_order=item.sort_order) for item in data.items
    ]
    db.add(routine)
    await db.commit()
    return await _get_owned_routine(db, user_id, routine.id)


async def update_routine(db: AsyncSession, user_id: UUID, routine_id: UUID, data: RoutineUpdate) -> Routine:
    routine = await _get_owned_routine(db, user_id, routine_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(routine, field, value)
    await db.commit()
    return await _get_owned_routine(db, user_id, routine_id)


async def delete_routine(db: AsyncSession, user_id: UUID, routine_id: UUID) -> None:
    routine = await _get_owned_routine(db, user_id, routine_id)
    await db.delete(routine)
    await db.commit()


async def add_item(db: AsyncSession, user_id: UUID, routine_id: UUID, data: RoutineItemCreate) -> Routine:
    routine = await _get_owned_routine(db, user_id, routine_id)
    db.add(RoutineItem(routine_id=routine.id, title=data.title, sort_order=data.sort_order))
    await db.commit()
    return await _get_owned_routine(db, user_id, routine_id)


def _get_owned_item(routine: Routine, item_id: UUID) -> RoutineItem:
    item = next((i for i in routine.items if i.id == item_id), None)
    if item is None:
        raise RoutineNotFound()
    return item


async def update_item(
    db: AsyncSession, user_id: UUID, routine_id: UUID, item_id: UUID, data: RoutineItemUpdate
) -> Routine:
    routine = await _get_owned_routine(db, user_id, routine_id)
    item = _get_owned_item(routine, item_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.commit()
    return await _get_owned_routine(db, user_id, routine_id)


async def delete_item(db: AsyncSession, user_id: UUID, routine_id: UUID, item_id: UUID) -> Routine:
    routine = await _get_owned_routine(db, user_id, routine_id)
    item = _get_owned_item(routine, item_id)
    await db.delete(item)
    await db.commit()
    return await _get_owned_routine(db, user_id, routine_id)


async def toggle_item_completion(
    db: AsyncSession, user_id: UUID, routine_id: UUID, item_id: UUID, on: date | None
) -> Routine:
    routine = await _get_owned_routine(db, user_id, routine_id)
    item = next((i for i in routine.items if i.id == item_id), None)
    if item is None:
        raise RoutineNotFound()

    target_date = on or date.today()
    existing = next((c for c in item.completions if c.completed_on == target_date), None)
    if existing is not None:
        await db.delete(existing)
    else:
        db.add(RoutineCompletion(routine_item_id=item.id, completed_on=target_date))
    await db.commit()
    return await _get_owned_routine(db, user_id, routine_id)


def annotate_completed_today(routines: list[Routine]) -> list[dict]:
    today = date.today()
    out = []
    for r in routines:
        items = []
        for item in sorted(r.items, key=lambda i: i.sort_order):
            items.append(
                {
                    "id": item.id,
                    "title": item.title,
                    "sort_order": item.sort_order,
                    "completed_today": any(c.completed_on == today for c in item.completions),
                }
            )
        out.append(
            {
                "id": r.id,
                "name": r.name,
                "time_of_day": r.time_of_day,
                "sort_order": r.sort_order,
                "items": items,
            }
        )
    return out
