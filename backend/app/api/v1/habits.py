from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.schemas.habit import HabitCreate, HabitOut, HabitUpdate
from app.services import habit as service

router = APIRouter(prefix="/habits", tags=["habits"])


@router.get("", response_model=list[HabitOut])
async def list_habits(
    include_archived: bool = False,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    habits = await service.list_habits(db, user_id, include_archived=include_archived)
    return [service.to_out_dict(h) for h in habits]


@router.post("", response_model=HabitOut, status_code=status.HTTP_201_CREATED)
async def create_habit(
    payload: HabitCreate, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    habit = await service.create_habit(db, user_id, payload)
    return service.to_out_dict(habit)


@router.patch("/{habit_id}", response_model=HabitOut)
async def update_habit(
    habit_id: UUID,
    payload: HabitUpdate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        habit = await service.update_habit(db, user_id, habit_id, payload)
    except service.HabitNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")
    return service.to_out_dict(habit)


@router.delete("/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_habit(
    habit_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        await service.archive_habit(db, user_id, habit_id)
    except service.HabitNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")


@router.post("/{habit_id}/toggle", response_model=HabitOut)
async def toggle_habit(
    habit_id: UUID,
    on: date | None = None,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        habit = await service.toggle_completion(db, user_id, habit_id, on)
    except service.HabitNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")
    return service.to_out_dict(habit)
