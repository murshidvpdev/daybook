from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.schemas.fitness import (
    ExerciseCreate,
    ExerciseOut,
    ExerciseSetCreate,
    ExerciseSetUpdate,
    ExerciseUpdate,
    WorkoutSessionCreate,
    WorkoutSessionOut,
    WorkoutSessionUpdate,
)
from app.services import fitness as service

router = APIRouter(prefix="/fitness", tags=["fitness"])


@router.get("/exercises", response_model=list[ExerciseOut])
async def list_exercises(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await service.list_exercises(db, user_id)


@router.post("/exercises", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
async def create_exercise(
    payload: ExerciseCreate, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    return await service.create_exercise(db, user_id, payload)


@router.patch("/exercises/{exercise_id}", response_model=ExerciseOut)
async def update_exercise(
    exercise_id: UUID,
    payload: ExerciseUpdate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.update_exercise(db, user_id, exercise_id, payload)
    except service.FitnessNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/exercises/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exercise(
    exercise_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        await service.delete_exercise(db, user_id, exercise_id)
    except service.FitnessNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/sessions", response_model=list[WorkoutSessionOut])
async def list_sessions(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await service.list_sessions(db, user_id)


@router.post("/sessions", response_model=WorkoutSessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: WorkoutSessionCreate, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    return await service.create_session(db, user_id, payload)


@router.patch("/sessions/{session_id}", response_model=WorkoutSessionOut)
async def update_session(
    session_id: UUID,
    payload: WorkoutSessionUpdate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.update_session(db, user_id, session_id, payload)
    except service.FitnessNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        await service.delete_session(db, user_id, session_id)
    except service.FitnessNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/sessions/{session_id}/sets", response_model=WorkoutSessionOut)
async def add_set(
    session_id: UUID,
    payload: ExerciseSetCreate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.add_set(db, user_id, session_id, payload)
    except service.FitnessNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.patch("/sessions/{session_id}/sets/{set_id}", response_model=WorkoutSessionOut)
async def update_set(
    session_id: UUID,
    set_id: UUID,
    payload: ExerciseSetUpdate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.update_set(db, user_id, session_id, set_id, payload)
    except service.FitnessNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/sessions/{session_id}/sets/{set_id}", response_model=WorkoutSessionOut)
async def delete_set(
    session_id: UUID,
    set_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.delete_set(db, user_id, session_id, set_id)
    except service.FitnessNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
