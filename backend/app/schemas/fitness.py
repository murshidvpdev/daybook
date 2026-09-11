from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ExerciseCreate(BaseModel):
    name: str
    muscle_group: str | None = None


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    muscle_group: str | None


class ExerciseSetCreate(BaseModel):
    exercise_id: UUID
    set_number: int = 1
    reps: int
    weight_kg: Decimal | None = None


class ExerciseSetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    exercise_id: UUID
    set_number: int
    reps: int
    weight_kg: Decimal | None


class WorkoutSessionCreate(BaseModel):
    name: str = "Workout"
    performed_on: date | None = None
    duration_minutes: int | None = None
    notes: str | None = None


class WorkoutSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    performed_on: date
    duration_minutes: int | None
    notes: str | None
    sets: list[ExerciseSetOut] = []
