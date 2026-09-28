from datetime import date, time
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class RoutineItemCreate(BaseModel):
    title: str
    sort_order: int = 0


class RoutineItemUpdate(BaseModel):
    title: str | None = None
    sort_order: int | None = None


class RoutineItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    sort_order: int
    completed_today: bool = False
    completed_at: time | None = None


class RoutineCreate(BaseModel):
    name: str
    time_of_day: str = "morning"
    items: list[RoutineItemCreate] = []


class RoutineUpdate(BaseModel):
    name: str | None = None
    time_of_day: str | None = None
    sort_order: int | None = None


class RoutineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    time_of_day: str
    sort_order: int
    items: list[RoutineItemOut] = []


class RoutineCompletionToggle(BaseModel):
    completed_on: date | None = None  # defaults to today in the service layer
    completed_at: time | None = None  # defaults to now, only used when marking done (not un-marking)


class RoutineCompletionTimeUpdate(BaseModel):
    completed_on: date | None = None  # which day's completion to correct; defaults to today
    completed_at: time
