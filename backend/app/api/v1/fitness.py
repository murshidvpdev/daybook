from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.schemas.fitness import (
    ExerciseCreate,
    ExerciseOut,
    ExerciseSetCreate,
    WorkoutSessionCreate,
    WorkoutSessionOut,
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


@router.get("/sessions", response_model=list[WorkoutSessionOut])
async def list_sessions(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await service.list_sessions(db, user_id)


@router.post("/sessions", response_model=WorkoutSessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: WorkoutSessionCreate, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    return await service.create_session(db, user_id, payload)


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
