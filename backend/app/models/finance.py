import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class FinancialAccount(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "financial_accounts"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    account_type: Mapped[str] = mapped_column(String(30), default="cash")  # cash | bank | credit_card
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    # Balance as of the day this account was added to Daybook — since transactions are
    # entered manually, this is what lets current_balance be accurate from day one
    # instead of starting everyone at zero regardless of their real balance.
    opening_balance: Mapped[float] = mapped_column(Numeric(12, 2), default=0)

    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )


class TransactionCategory(Base, UUIDPKMixin):
    __tablename__ = "transaction_categories"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(10), default="expense")  # expense | income


class Transaction(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "transactions"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("financial_accounts.id", ondelete="CASCADE"), index=True
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transaction_categories.id", ondelete="SET NULL"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(10), default="expense")  # expense | income
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    occurred_on: Mapped[date] = mapped_column(Date, index=True)

    account: Mapped[FinancialAccount] = relationship(back_populates="transactions")


class CreditCard(Base, UUIDPKMixin, TimestampMixin):
    """Credit-card-specific fields, one-to-one with a `credit_card`-type FinancialAccount.
    Kept as its own table rather than columns on FinancialAccount so a cash/bank account
    never carries nullable credit-card-only fields."""

    __tablename__ = "credit_cards"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("financial_accounts.id", ondelete="CASCADE"), unique=True, index=True
    )
    last_four: Mapped[str | None] = mapped_column(String(4), nullable=True)
    credit_limit: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    due_day: Mapped[int] = mapped_column(Integer)  # 1-31, clamped to each month's actual length

    account: Mapped[FinancialAccount] = relationship()


class EMI(Base, UUIDPKMixin, TimestampMixin):
    """A fixed-tenure installment plan debited from any account — a credit card
    (most common) or a bank/debit account (e.g. a personal loan on auto-debit).
    Unlike a SIP, an EMI installment is never assumed paid — once its due date
    arrives it just sits at `is_due` until the user explicitly confirms payment
    (see services/finance.py:confirm_emi_payment), which is what actually posts
    the transaction and advances the schedule."""

    __tablename__ = "emis"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("financial_accounts.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    monthly_amount: Mapped[float] = mapped_column(Numeric(12, 2))
    total_installments: Mapped[int] = mapped_column(Integer)
    installments_paid: Mapped[int] = mapped_column(Integer, default=0)
    due_day: Mapped[int] = mapped_column(Integer)
    next_due_date: Mapped[date] = mapped_column(Date, index=True)

    account: Mapped[FinancialAccount] = relationship()

    @property
    def is_completed(self) -> bool:
        return self.installments_paid >= self.total_installments

    @property
    def is_due(self) -> bool:
        return not self.is_completed and self.next_due_date <= date.today()


class SIP(Base, UUIDPKMixin, TimestampMixin):
    """A recurring monthly investment debit. Same lazy due-date generation as EMI."""

    __tablename__ = "sips"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("financial_accounts.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    due_day: Mapped[int] = mapped_column(Integer)
    next_due_date: Mapped[date] = mapped_column(Date, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    account: Mapped[FinancialAccount] = relationship()


class CreditCardBill(Base, UUIDPKMixin, TimestampMixin):
    """A closed billing-cycle snapshot: the total charged between two dates, due on
    a fixed date, paid or not. Generated on demand (POST .../bills) rather than
    automatically — see services/finance.py — since only the user knows when their
    real statement actually closed."""

    __tablename__ = "credit_card_bills"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    credit_card_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("credit_cards.id", ondelete="CASCADE"), index=True
    )
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    due_date: Mapped[date] = mapped_column(Date)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    paid_on: Mapped[date | None] = mapped_column(Date, nullable=True)


class Lending(Base, UUIDPKMixin, TimestampMixin):
    """Money lent to or borrowed from a person outside the app — a friend, say —
    tracked separately from account transactions since it's a receivable/payable,
    not spending. `phone_number` is only ever used to build a tap-to-send
    SMS/WhatsApp link client-side; this app never sends anything on its own."""

    __tablename__ = "lendings"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    person_name: Mapped[str] = mapped_column(String(120))
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    direction: Mapped[str] = mapped_column(String(10))  # lent | borrowed
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    given_on: Mapped[date] = mapped_column(Date)
    remind_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_settled: Mapped[bool] = mapped_column(Boolean, default=False)
    settled_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Set when this record was created alongside a linked transaction — either from
    # a card spend marked "lent to a friend", or from picking a source/destination
    # account right here. Kept SET NULL (not CASCADE) so deleting the transaction
    # never silently deletes the receivable itself.
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )

    payments: Mapped[list["LendingPayment"]] = relationship(
        back_populates="lending", cascade="all, delete-orphan"
    )


class LendingPayment(Base, UUIDPKMixin, TimestampMixin):
    """One partial (or full) repayment toward a Lending — split out from the
    parent record because a friend rarely pays back the full amount in one go.
    Each entry can optionally link to the account the money actually moved
    through, same SET-NULL pattern as Lending.transaction_id itself."""

    __tablename__ = "lending_payments"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    lending_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lendings.id", ondelete="CASCADE"), index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    paid_on: Mapped[date] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )

    lending: Mapped[Lending] = relationship(back_populates="payments")
