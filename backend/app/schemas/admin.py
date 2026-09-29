from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class AdminAccessTokenResponse(BaseModel):
    access_token: str


class AdminStatsOut(BaseModel):
    total_users: int
    new_users_today: int
    new_users_this_week: int
    active_users_today: int
    active_users_this_week: int


class UserListItemOut(BaseModel):
    id: UUID
    email: str
    display_name: str | None
    created_at: datetime
    is_active: bool
    active_today: bool
    transactions_count: int
    routines_count: int
    habits_count: int
    workouts_count: int


class UserRoutineSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    time_of_day: str
    item_count: int


class UserHabitSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    cadence: str
    is_archived: bool


class UserWorkoutSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    performed_on: date
    duration_minutes: int | None


class UserTransactionSummary(BaseModel):
    id: UUID
    kind: str
    amount: Decimal
    note: str | None
    occurred_on: date


class UserFinanceSummary(BaseModel):
    total_balance: Decimal
    net_worth: Decimal
    spent_this_month: Decimal
    income_this_month: Decimal


class UserDetailOut(BaseModel):
    id: UUID
    email: str
    display_name: str | None
    created_at: datetime
    is_active: bool
    finance: UserFinanceSummary
    recent_transactions: list[UserTransactionSummary]
    routines: list[UserRoutineSummary]
    habits: list[UserHabitSummary]
    recent_workouts: list[UserWorkoutSummary]


class ResetPasswordRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class SetActiveRequest(BaseModel):
    is_active: bool
