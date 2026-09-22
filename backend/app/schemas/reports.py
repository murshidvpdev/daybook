from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class RoutineItemDone(BaseModel):
    routine_name: str
    item_title: str


class HabitDone(BaseModel):
    name: str


class TransactionLine(BaseModel):
    account_name: str
    category_name: str | None
    kind: str
    amount: Decimal
    note: str | None


class ExerciseSetLine(BaseModel):
    exercise_name: str
    reps: int
    weight_kg: Decimal | None


class WorkoutLine(BaseModel):
    name: str
    duration_minutes: int | None
    notes: str | None
    sets: list[ExerciseSetLine]


class LendingLine(BaseModel):
    person_name: str
    direction: str
    amount: Decimal


class DayReportOut(BaseModel):
    report_date: date
    routine_items_done: list[RoutineItemDone]
    routine_items_total: int
    habits_done: list[HabitDone]
    habits_total: int
    transactions: list[TransactionLine]
    total_spent: Decimal
    total_income: Decimal
    workouts: list[WorkoutLine]
    lendings: list[LendingLine]
