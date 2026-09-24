from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class AccountCreate(BaseModel):
    name: str
    account_type: str = "cash"
    currency: str = "INR"
    opening_balance: Decimal = Decimal(0)


class AccountUpdate(BaseModel):
    name: str | None = None
    account_type: str | None = None
    currency: str | None = None
    opening_balance: Decimal | None = None


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    account_type: str
    currency: str
    opening_balance: Decimal
    current_balance: Decimal


class BalanceAdjustment(BaseModel):
    """What the account should show right now — e.g. copied from a banking app —
    not a delta. The service computes the difference itself and posts a single
    transaction for it, so the change stays auditable instead of silently
    rewriting opening_balance."""

    actual_balance: Decimal
    note: str | None = None


class CategoryCreate(BaseModel):
    name: str
    kind: str = "expense"


class CategoryUpdate(BaseModel):
    name: str | None = None
    kind: str | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    kind: str


class TransactionCreate(BaseModel):
    account_id: UUID
    category_id: UUID | None = None
    kind: str = "expense"
    amount: Decimal
    note: str | None = None
    occurred_on: date | None = None  # defaults to today


class TransactionUpdate(BaseModel):
    account_id: UUID | None = None
    category_id: UUID | None = None
    kind: str | None = None
    amount: Decimal | None = None
    note: str | None = None
    occurred_on: date | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    account_id: UUID
    category_id: UUID | None
    kind: str
    amount: Decimal
    note: str | None
    occurred_on: date


def _validate_due_day(v: int) -> int:
    if not 1 <= v <= 31:
        raise ValueError("due_day must be between 1 and 31")
    return v


class CreditCardCreate(BaseModel):
    name: str
    last_four: str | None = None
    credit_limit: Decimal | None = None
    due_day: int
    opening_balance: Decimal = Decimal(0)  # existing balance owed, if added mid-cycle

    _validate_due_day = field_validator("due_day")(_validate_due_day)


class CreditCardUpdate(BaseModel):
    name: str | None = None
    last_four: str | None = None
    credit_limit: Decimal | None = None
    due_day: int | None = None
    opening_balance: Decimal | None = None

    @field_validator("due_day")
    @classmethod
    def _validate_due_day_optional(cls, v: int | None) -> int | None:
        return v if v is None else _validate_due_day(v)


class CreditCardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    account_id: UUID
    name: str
    last_four: str | None
    credit_limit: Decimal | None
    due_day: int
    next_due_date: date
    outstanding_balance: Decimal


class EMICreate(BaseModel):
    account_id: UUID  # a credit card or a bank/debit account — anything auto-debited
    name: str
    monthly_amount: Decimal
    total_installments: int
    due_day: int
    start_date: date | None = None  # first due date; defaults to next occurrence of due_day

    _validate_due_day = field_validator("due_day")(_validate_due_day)


class EMIUpdate(BaseModel):
    name: str | None = None
    monthly_amount: Decimal | None = None
    total_installments: int | None = None
    due_day: int | None = None

    @field_validator("due_day")
    @classmethod
    def _validate_due_day_optional(cls, v: int | None) -> int | None:
        return v if v is None else _validate_due_day(v)


class EMIOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    account_id: UUID
    name: str
    monthly_amount: Decimal
    total_installments: int
    installments_paid: int
    due_day: int
    next_due_date: date
    is_completed: bool
    is_due: bool


class SIPCreate(BaseModel):
    account_id: UUID
    name: str
    amount: Decimal
    due_day: int
    start_date: date | None = None

    _validate_due_day = field_validator("due_day")(_validate_due_day)


class SIPUpdate(BaseModel):
    name: str | None = None
    amount: Decimal | None = None
    due_day: int | None = None
    is_active: bool | None = None

    @field_validator("due_day")
    @classmethod
    def _validate_due_day_optional(cls, v: int | None) -> int | None:
        return v if v is None else _validate_due_day(v)


class SIPOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    account_id: UUID
    name: str
    amount: Decimal
    due_day: int
    next_due_date: date
    is_active: bool


class LendingCreate(BaseModel):
    person_name: str
    phone_number: str | None = None
    direction: str  # lent | borrowed
    amount: Decimal
    given_on: date | None = None
    remind_on: date | None = None
    note: str | None = None
    # When set, also creates the matching transaction on this account — an expense
    # for "lent" (money left the account), income for "borrowed" (money came in) —
    # so the account balance actually reflects it instead of just the receivable.
    account_id: UUID | None = None

    @field_validator("direction")
    @classmethod
    def validate_direction(cls, v: str) -> str:
        if v not in ("lent", "borrowed"):
            raise ValueError("direction must be 'lent' or 'borrowed'")
        return v


class LendingUpdate(BaseModel):
    person_name: str | None = None
    phone_number: str | None = None
    amount: Decimal | None = None
    given_on: date | None = None
    remind_on: date | None = None
    note: str | None = None


class LendingPaymentCreate(BaseModel):
    amount: Decimal
    paid_on: date | None = None
    # When set, also creates a matching transaction — income for "lent" (the
    # money coming back to you), expense for "borrowed" (you paying it back).
    account_id: UUID | None = None
    note: str | None = None


class LendingPaymentOut(BaseModel):
    id: UUID
    amount: Decimal
    paid_on: date
    note: str | None
    account_id: UUID | None
    transaction_id: UUID | None


class LendingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    person_name: str
    phone_number: str | None
    direction: str
    amount: Decimal
    given_on: date
    remind_on: date | None
    note: str | None
    is_settled: bool
    settled_on: date | None
    transaction_id: UUID | None
    amount_paid: Decimal
    outstanding: Decimal
    payments: list[LendingPaymentOut]


class ReminderLinksOut(BaseModel):
    message: str
    sms_link: str
    whatsapp_link: str


# --- Credit card bills -------------------------------------------------------


class CreditCardBillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    credit_card_id: UUID
    period_start: date
    period_end: date
    amount: Decimal
    due_date: date
    is_paid: bool
    paid_on: date | None


# --- Credit card quick-spend (with optional auto-lending) -------------------


class LendPayload(BaseModel):
    person_name: str
    phone_number: str | None = None
    remind_on: date | None = None


class CreditCardSpendCreate(BaseModel):
    amount: Decimal
    note: str | None = None
    category_id: UUID | None = None
    occurred_on: date | None = None
    lend: LendPayload | None = None  # set when this spend was money handed to a friend


class CreditCardSpendResult(BaseModel):
    transaction: TransactionOut
    lending: LendingOut | None


# --- Analytics ---------------------------------------------------------------


class SpendTrendPoint(BaseModel):
    date: date
    total: Decimal


class CategoryBreakdownItem(BaseModel):
    category_name: str
    total: Decimal


class AccountBreakdownItem(BaseModel):
    account_name: str
    account_type: str
    total: Decimal


class FinanceSummaryOut(BaseModel):
    total_balance: Decimal  # cash + bank accounts only — what you actually have
    total_credit_card_debt: Decimal
    net_worth: Decimal  # total_balance - total_credit_card_debt
    spent_this_month: Decimal
    # Money lent to a friend already left the account once (that transaction already
    # moved the balance) — it isn't spending on top of that, it's a receivable. This
    # backs those specific transactions out so lending doesn't inflate "spent".
    spent_this_month_excluding_lending: Decimal
    income_this_month: Decimal
    outstanding_lent: Decimal  # unsettled money owed to you
    outstanding_borrowed: Decimal  # unsettled money you owe
    top_spend_account: AccountBreakdownItem | None  # "which bank most" — this month
