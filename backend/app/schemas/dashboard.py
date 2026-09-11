from pydantic import BaseModel


class RoutineSummary(BaseModel):
    completed: int
    total: int


class HabitSummary(BaseModel):
    completed: int
    total: int


class FinanceSummary(BaseModel):
    spent_today: float
    currency: str


class FitnessSummary(BaseModel):
    last_workout_on: str | None
    logged_today: bool


class TodaySummary(BaseModel):
    date: str
    routines: RoutineSummary
    habits: HabitSummary
    finance: FinanceSummary
    fitness: FitnessSummary
