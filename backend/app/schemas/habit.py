from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class HabitCreate(BaseModel):
    name: str
    cadence: str = "daily"


class HabitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    cadence: str
    is_archived: bool
    completed_today: bool = False
    current_streak: int = 0


class HabitCompletionToggle(BaseModel):
    completed_on: date | None = None
