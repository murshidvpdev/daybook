from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.schemas.routine import (
    RoutineCreate,
    RoutineItemCreate,
    RoutineItemUpdate,
    RoutineOut,
    RoutineUpdate,
)
from app.services import routine as service

router = APIRouter(prefix="/routines", tags=["routines"])


@router.get("", response_model=list[RoutineOut])
async def list_routines(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    routines = await service.list_routines(db, user_id)
    return service.annotate_completed_today(routines)


@router.post("", response_model=RoutineOut, status_code=status.HTTP_201_CREATED)
async def create_routine(
    payload: RoutineCreate, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    routine = await service.create_routine(db, user_id, payload)
    return service.annotate_completed_today([routine])[0]


@router.patch("/{routine_id}", response_model=RoutineOut)
async def update_routine(
    routine_id: UUID,
    payload: RoutineUpdate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        routine = await service.update_routine(db, user_id, routine_id, payload)
    except service.RoutineNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routine not found")
    return service.annotate_completed_today([routine])[0]


@router.delete("/{routine_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_routine(
    routine_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        await service.delete_routine(db, user_id, routine_id)
    except service.RoutineNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routine not found")


@router.post("/{routine_id}/items", response_model=RoutineOut, status_code=status.HTTP_201_CREATED)
async def add_item(
    routine_id: UUID,
    payload: RoutineItemCreate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        routine = await service.add_item(db, user_id, routine_id, payload)
    except service.RoutineNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routine not found")
    return service.annotate_completed_today([routine])[0]


@router.patch("/{routine_id}/items/{item_id}", response_model=RoutineOut)
async def update_item(
    routine_id: UUID,
    item_id: UUID,
    payload: RoutineItemUpdate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        routine = await service.update_item(db, user_id, routine_id, item_id, payload)
    except service.RoutineNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routine or item not found")
    return service.annotate_completed_today([routine])[0]


@router.delete("/{routine_id}/items/{item_id}", response_model=RoutineOut)
async def delete_item(
    routine_id: UUID,
    item_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        routine = await service.delete_item(db, user_id, routine_id, item_id)
    except service.RoutineNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routine or item not found")
    return service.annotate_completed_today([routine])[0]


@router.post("/{routine_id}/items/{item_id}/toggle", response_model=RoutineOut)
async def toggle_item(
    routine_id: UUID,
    item_id: UUID,
    on: date | None = None,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        routine = await service.toggle_item_completion(db, user_id, routine_id, item_id, on)
    except service.RoutineNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Routine or item not found")
    return service.annotate_completed_today([routine])[0]
