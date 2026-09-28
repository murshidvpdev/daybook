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


class TopCategory(BaseModel):
    category_name: str
    total: Decimal


class PeriodReportOut(BaseModel):
    label: str  # e.g. "September 2026" or "All time"
    start_date: date | None
    end_date: date | None
    routine_completions: int
    habits_completed: int
    transactions_count: int
    total_spent: Decimal
    total_income: Decimal
    net: Decimal
    top_category: TopCategory | None
    workouts_count: int
    total_sets: int
    lending_given: Decimal
    lending_borrowed: Decimal
    lending_repaid: Decimal
