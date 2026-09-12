from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.finance import (
    EMI,
    SIP,
    CreditCard,
    CreditCardBill,
    FinancialAccount,
    Lending,
    Transaction,
    TransactionCategory,
)
from app.schemas.finance import (
    AccountCreate,
    AccountUpdate,
    CategoryCreate,
    CategoryUpdate,
    CreditCardCreate,
    CreditCardSpendCreate,
    CreditCardUpdate,
    EMICreate,
    EMIUpdate,
    LendingCreate,
    LendingUpdate,
    SIPCreate,
    SIPUpdate,
    TransactionCreate,
    TransactionUpdate,
)
from app.services.recurring import advance_one_month, compute_next_due_date, sync_due_sips


class FinanceNotFound(Exception):
    pass


class FinanceValidationError(Exception):
    pass


async def _income_expense_totals(db: AsyncSession, account_id: UUID) -> tuple[float, float]:
    income, expense = (
        await db.execute(
            select(
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == "income"), 0),
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == "expense"), 0),
            ).where(Transaction.account_id == account_id)
        )
    ).one()
    return float(income), float(expense)


async def _account_out(db: AsyncSession, account: FinancialAccount) -> dict:
    income, expense = await _income_expense_totals(db, account.id)
    return {
        "id": account.id,
        "name": account.name,
        "account_type": account.account_type,
        "currency": account.currency,
        "opening_balance": account.opening_balance,
        "current_balance": float(account.opening_balance) + income - expense,
    }


async def list_accounts(db: AsyncSession, user_id: UUID) -> list[dict]:
    accounts = (
        await db.scalars(select(FinancialAccount).where(FinancialAccount.user_id == user_id))
    ).all()
    return [await _account_out(db, a) for a in accounts]


async def create_account(db: AsyncSession, user_id: UUID, data: AccountCreate) -> dict:
    account = FinancialAccount(user_id=user_id, **data.model_dump())
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return await _account_out(db, account)


async def _get_owned_account(db: AsyncSession, user_id: UUID, account_id: UUID) -> FinancialAccount:
    account = await db.scalar(
        select(FinancialAccount).where(FinancialAccount.id == account_id, FinancialAccount.user_id == user_id)
    )
    if account is None:
        raise FinanceNotFound("Account not found")
    return account


async def update_account(db: AsyncSession, user_id: UUID, account_id: UUID, data: AccountUpdate) -> dict:
    account = await _get_owned_account(db, user_id, account_id)
    if account.account_type == "credit_card":
        # A credit card's own dedicated form owns these fields (and keeps its
        # CreditCard row's due_day/limit in sync) — editing the plain account
        # underneath it here would let the two drift apart silently.
        raise FinanceValidationError("Edit this card from the Credit Cards tab instead")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    await db.commit()
    await db.refresh(account)
    return await _account_out(db, account)


async def delete_account(db: AsyncSession, user_id: UUID, account_id: UUID) -> None:
    account = await _get_owned_account(db, user_id, account_id)
    if account.account_type == "credit_card":
        raise FinanceValidationError("Delete this card from the Credit Cards tab instead")
    await db.delete(account)  # cascades to its transactions
    await db.commit()


async def list_categories(db: AsyncSession, user_id: UUID) -> list[TransactionCategory]:
    result = await db.scalars(select(TransactionCategory).where(TransactionCategory.user_id == user_id))
    return list(result.all())


async def create_category(db: AsyncSession, user_id: UUID, data: CategoryCreate) -> TransactionCategory:
    category = TransactionCategory(user_id=user_id, **data.model_dump())
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


async def _get_owned_category(db: AsyncSession, user_id: UUID, category_id: UUID) -> TransactionCategory:
    category = await db.scalar(
        select(TransactionCategory).where(
            TransactionCategory.id == category_id, TransactionCategory.user_id == user_id
        )
    )
    if category is None:
        raise FinanceNotFound("Category not found")
    return category


async def update_category(
    db: AsyncSession, user_id: UUID, category_id: UUID, data: CategoryUpdate
) -> TransactionCategory:
    category = await _get_owned_category(db, user_id, category_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    await db.commit()
    await db.refresh(category)
    return category


async def delete_category(db: AsyncSession, user_id: UUID, category_id: UUID) -> None:
    category = await _get_owned_category(db, user_id, category_id)
    await db.delete(category)  # transactions using it fall back to Uncategorized (ON DELETE SET NULL)
    await db.commit()


async def _assert_account_owned(db: AsyncSession, user_id: UUID, account_id: UUID) -> None:
    account = await db.scalar(
        select(FinancialAccount).where(FinancialAccount.id == account_id, FinancialAccount.user_id == user_id)
    )
    if account is None:
        raise FinanceNotFound("Account not found")


async def _assert_category_owned(db: AsyncSession, user_id: UUID, category_id: UUID | None) -> None:
    if category_id is None:
        return
    category = await db.scalar(
        select(TransactionCategory).where(
            TransactionCategory.id == category_id, TransactionCategory.user_id == user_id
        )
    )
    if category is None:
        raise FinanceNotFound("Category not found")


async def list_transactions(db: AsyncSession, user_id: UUID, limit: int = 50) -> list[Transaction]:
    await sync_due_sips(db, user_id)
    result = await db.scalars(
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .order_by(Transaction.occurred_on.desc(), Transaction.created_at.desc())
        .limit(limit)
    )
    return list(result.all())


async def create_transaction(db: AsyncSession, user_id: UUID, data: TransactionCreate) -> Transaction:
    await _assert_account_owned(db, user_id, data.account_id)
    await _assert_category_owned(db, user_id, data.category_id)
    txn = Transaction(
        user_id=user_id,
        account_id=data.account_id,
        category_id=data.category_id,
        kind=data.kind,
        amount=data.amount,
        note=data.note,
        occurred_on=data.occurred_on or date.today(),
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)
    return txn


async def _get_owned_transaction(db: AsyncSession, user_id: UUID, transaction_id: UUID) -> Transaction:
    txn = await db.scalar(
        select(Transaction).where(Transaction.id == transaction_id, Transaction.user_id == user_id)
    )
    if txn is None:
        raise FinanceNotFound("Transaction not found")
    return txn


async def update_transaction(
    db: AsyncSession, user_id: UUID, transaction_id: UUID, data: TransactionUpdate
) -> Transaction:
    txn = await _get_owned_transaction(db, user_id, transaction_id)
    updates = data.model_dump(exclude_unset=True)
    if "account_id" in updates:
        await _assert_account_owned(db, user_id, updates["account_id"])
    if "category_id" in updates:
        await _assert_category_owned(db, user_id, updates["category_id"])
    for field, value in updates.items():
        setattr(txn, field, value)
    await db.commit()
    await db.refresh(txn)
    return txn


async def delete_transaction(db: AsyncSession, user_id: UUID, transaction_id: UUID) -> None:
    txn = await _get_owned_transaction(db, user_id, transaction_id)
    await db.delete(txn)
    await db.commit()


async def spent_on(db: AsyncSession, user_id: UUID, on: date) -> float:
    total = await db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == user_id,
            Transaction.kind == "expense",
            Transaction.occurred_on == on,
        )
    )
    return float(total or 0)


# --- Credit cards ------------------------------------------------------------


async def _outstanding_balance(db: AsyncSession, account_id: UUID, opening_balance: float = 0) -> float:
    income, expense = await _income_expense_totals(db, account_id)
    return float(opening_balance) + expense - income


async def _credit_card_out(db: AsyncSession, card: CreditCard) -> dict:
    return {
        "id": card.id,
        "account_id": card.account_id,
        "name": card.account.name,
        "last_four": card.last_four,
        "credit_limit": card.credit_limit,
        "due_day": card.due_day,
        "next_due_date": compute_next_due_date(card.due_day),
        "outstanding_balance": await _outstanding_balance(db, card.account_id, card.account.opening_balance),
    }


async def list_credit_cards(db: AsyncSession, user_id: UUID) -> list[dict]:
    await sync_due_sips(db, user_id)
    cards = (
        await db.scalars(
            select(CreditCard)
            .options(selectinload(CreditCard.account))
            .where(CreditCard.user_id == user_id)
        )
    ).all()
    return [await _credit_card_out(db, c) for c in cards]


async def create_credit_card(db: AsyncSession, user_id: UUID, data: CreditCardCreate) -> dict:
    account = FinancialAccount(
        user_id=user_id, name=data.name, account_type="credit_card", opening_balance=data.opening_balance
    )
    db.add(account)
    await db.flush()
    card = CreditCard(
        user_id=user_id,
        account_id=account.id,
        last_four=data.last_four,
        credit_limit=data.credit_limit,
        due_day=data.due_day,
    )
    db.add(card)
    await db.commit()
    card.account = account
    return await _credit_card_out(db, card)


async def _get_owned_credit_card(db: AsyncSession, user_id: UUID, card_id: UUID) -> CreditCard:
    card = await db.scalar(
        select(CreditCard)
        .options(selectinload(CreditCard.account))
        .where(CreditCard.id == card_id, CreditCard.user_id == user_id)
    )
    if card is None:
        raise FinanceNotFound("Credit card not found")
    return card


async def update_credit_card(db: AsyncSession, user_id: UUID, card_id: UUID, data: CreditCardUpdate) -> dict:
    card = await _get_owned_credit_card(db, user_id, card_id)
    updates = data.model_dump(exclude_unset=True)
    if "name" in updates:
        card.account.name = updates.pop("name")
    if "opening_balance" in updates:
        card.account.opening_balance = updates.pop("opening_balance")
    for field, value in updates.items():
        setattr(card, field, value)
    await db.commit()
    await db.refresh(card)
    return await _credit_card_out(db, card)


async def delete_credit_card(db: AsyncSession, user_id: UUID, card_id: UUID) -> None:
    card = await _get_owned_credit_card(db, user_id, card_id)
    account = await db.get(FinancialAccount, card.account_id)
    await db.delete(card)
    if account is not None:
        await db.delete(account)  # cascades to its transactions
    await db.commit()


async def spend_on_credit_card(
    db: AsyncSession, user_id: UUID, card_id: UUID, data: CreditCardSpendCreate
) -> tuple[Transaction, Lending | None]:
    """Logs a card charge and, when it was actually money handed to a friend rather
    than a purchase, creates the matching receivable in the same call — the two
    facts (I spent this / someone owes me this) are recorded together instead of
    relying on the user to remember to log both."""
    card = await _get_owned_credit_card(db, user_id, card_id)
    await _assert_category_owned(db, user_id, data.category_id)
    occurred_on = data.occurred_on or date.today()

    txn = Transaction(
        user_id=user_id,
        account_id=card.account_id,
        category_id=data.category_id,
        kind="expense",
        amount=data.amount,
        note=data.note,
        occurred_on=occurred_on,
    )
    db.add(txn)
    await db.flush()

    lending = None
    if data.lend is not None:
        lending = Lending(
            user_id=user_id,
            person_name=data.lend.person_name,
            phone_number=data.lend.phone_number,
            direction="lent",
            amount=data.amount,
            given_on=occurred_on,
            remind_on=data.lend.remind_on,
            note=data.note or f"Lent via {card.account.name}",
            transaction_id=txn.id,
        )
        db.add(lending)

    await db.commit()
    await db.refresh(txn)
    if lending is not None:
        await db.refresh(lending)
    return txn, lending


# --- Credit card bills -------------------------------------------------------


async def list_bills(db: AsyncSession, user_id: UUID, card_id: UUID) -> list[CreditCardBill]:
    await _get_owned_credit_card(db, user_id, card_id)  # raises if not owned
    result = await db.scalars(
        select(CreditCardBill)
        .where(CreditCardBill.credit_card_id == card_id, CreditCardBill.user_id == user_id)
        .order_by(CreditCardBill.period_end.desc())
    )
    return list(result.all())


async def generate_bill(db: AsyncSession, user_id: UUID, card_id: UUID) -> CreditCardBill:
    card = await _get_owned_credit_card(db, user_id, card_id)
    today = date.today()

    last_bill = await db.scalar(
        select(CreditCardBill)
        .where(CreditCardBill.credit_card_id == card_id)
        .order_by(CreditCardBill.period_end.desc())
        .limit(1)
    )
    period_start = last_bill.period_end + timedelta(days=1) if last_bill else card.created_at.date()
    if period_start > today:
        raise FinanceValidationError("This card's last bill already covers today")

    income, expense = (
        await db.execute(
            select(
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == "income"), 0),
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == "expense"), 0),
            ).where(
                Transaction.account_id == card.account_id,
                Transaction.occurred_on >= period_start,
                Transaction.occurred_on <= today,
            )
        )
    ).one()
    amount = float(expense) - float(income)
    if last_bill is None:
        amount += float(card.account.opening_balance)

    bill = CreditCardBill(
        user_id=user_id,
        credit_card_id=card.id,
        period_start=period_start,
        period_end=today,
        amount=amount,
        due_date=compute_next_due_date(card.due_day, from_date=today),
    )
    db.add(bill)
    await db.commit()
    await db.refresh(bill)
    return bill


async def pay_bill(db: AsyncSession, user_id: UUID, bill_id: UUID) -> CreditCardBill:
    bill = await db.scalar(
        select(CreditCardBill).where(CreditCardBill.id == bill_id, CreditCardBill.user_id == user_id)
    )
    if bill is None:
        raise FinanceNotFound("Bill not found")
    if bill.is_paid:
        return bill

    card = await db.get(CreditCard, bill.credit_card_id)
    db.add(
        Transaction(
            user_id=user_id,
            account_id=card.account_id,
            kind="income",
            amount=bill.amount,
            note=f"Bill payment ({bill.period_start} to {bill.period_end})",
            occurred_on=date.today(),
        )
    )
    bill.is_paid = True
    bill.paid_on = date.today()
    await db.commit()
    await db.refresh(bill)
    return bill


# --- EMIs ---------------------------------------------------------------------


async def list_emis(db: AsyncSession, user_id: UUID) -> list[EMI]:
    result = await db.scalars(
        select(EMI).where(EMI.user_id == user_id).order_by(EMI.next_due_date)
    )
    return list(result.all())


async def create_emi(db: AsyncSession, user_id: UUID, data: EMICreate) -> EMI:
    await _assert_account_owned(db, user_id, data.account_id)
    first_due = data.start_date or compute_next_due_date(data.due_day)
    emi = EMI(
        user_id=user_id,
        account_id=data.account_id,
        name=data.name,
        monthly_amount=data.monthly_amount,
        total_installments=data.total_installments,
        due_day=data.due_day,
        next_due_date=first_due,
    )
    db.add(emi)
    await db.commit()
    await db.refresh(emi)
    return emi


async def update_emi(db: AsyncSession, user_id: UUID, emi_id: UUID, data: EMIUpdate) -> EMI:
    emi = await db.scalar(select(EMI).where(EMI.id == emi_id, EMI.user_id == user_id))
    if emi is None:
        raise FinanceNotFound("EMI not found")
    updates = data.model_dump(exclude_unset=True)
    # Changing the due day mid-cycle re-anchors the next occurrence to it —
    # editing "the 5th" to "the 12th" should move next month's date, not
    # leave a due date computed from a due_day that's no longer accurate.
    if "due_day" in updates:
        emi.next_due_date = compute_next_due_date(updates["due_day"], from_date=emi.next_due_date)
    for field, value in updates.items():
        setattr(emi, field, value)
    await db.commit()
    await db.refresh(emi)
    return emi


async def delete_emi(db: AsyncSession, user_id: UUID, emi_id: UUID) -> None:
    emi = await db.scalar(select(EMI).where(EMI.id == emi_id, EMI.user_id == user_id))
    if emi is None:
        raise FinanceNotFound("EMI not found")
    await db.delete(emi)
    await db.commit()


async def confirm_emi_payment(db: AsyncSession, user_id: UUID, emi_id: UUID) -> EMI:
    """Called when the user answers "yes, I paid this" for a due installment —
    only then does the expense actually post and the account balance move.
    One call covers exactly one installment; a user who's behind on two months
    confirms twice, so nothing is ever silently bulk-charged on their behalf."""
    emi = await db.scalar(select(EMI).where(EMI.id == emi_id, EMI.user_id == user_id))
    if emi is None:
        raise FinanceNotFound("EMI not found")
    if emi.is_completed:
        raise FinanceValidationError("This EMI is already fully paid off")
    if emi.next_due_date > date.today():
        raise FinanceValidationError("This EMI isn't due yet")

    db.add(
        Transaction(
            user_id=user_id,
            account_id=emi.account_id,
            kind="expense",
            amount=emi.monthly_amount,
            note=f"EMI: {emi.name} ({emi.installments_paid + 1}/{emi.total_installments})",
            occurred_on=emi.next_due_date,
        )
    )
    emi.installments_paid += 1
    emi.next_due_date = advance_one_month(emi.due_day, emi.next_due_date)
    await db.commit()
    await db.refresh(emi)
    return emi


# --- SIPs -----------------------------------------------------------------


async def list_sips(db: AsyncSession, user_id: UUID) -> list[SIP]:
    await sync_due_sips(db, user_id)
    result = await db.scalars(
        select(SIP).where(SIP.user_id == user_id, SIP.is_active.is_(True)).order_by(SIP.next_due_date)
    )
    return list(result.all())


async def create_sip(db: AsyncSession, user_id: UUID, data: SIPCreate) -> SIP:
    await _assert_account_owned(db, user_id, data.account_id)
    first_due = data.start_date or compute_next_due_date(data.due_day)
    sip = SIP(
        user_id=user_id,
        account_id=data.account_id,
        name=data.name,
        amount=data.amount,
        due_day=data.due_day,
        next_due_date=first_due,
    )
    db.add(sip)
    await db.commit()
    await db.refresh(sip)
    return sip


async def update_sip(db: AsyncSession, user_id: UUID, sip_id: UUID, data: SIPUpdate) -> SIP:
    sip = await db.scalar(select(SIP).where(SIP.id == sip_id, SIP.user_id == user_id))
    if sip is None:
        raise FinanceNotFound("SIP not found")
    updates = data.model_dump(exclude_unset=True)
    if "due_day" in updates:
        sip.next_due_date = compute_next_due_date(updates["due_day"], from_date=sip.next_due_date)
    for field, value in updates.items():
        setattr(sip, field, value)
    await db.commit()
    await db.refresh(sip)
    return sip


async def stop_sip(db: AsyncSession, user_id: UUID, sip_id: UUID) -> None:
    sip = await db.scalar(select(SIP).where(SIP.id == sip_id, SIP.user_id == user_id))
    if sip is None:
        raise FinanceNotFound("SIP not found")
    sip.is_active = False
    await db.commit()


# --- Lending (friends) ------------------------------------------------------


async def list_lendings(db: AsyncSession, user_id: UUID) -> list[Lending]:
    result = await db.scalars(
        select(Lending)
        .where(Lending.user_id == user_id)
        .order_by(Lending.is_settled, Lending.remind_on.nulls_last(), Lending.given_on.desc())
    )
    return list(result.all())


async def create_lending(db: AsyncSession, user_id: UUID, data: LendingCreate) -> Lending:
    given_on = data.given_on or date.today()
    txn = None
    if data.account_id is not None:
        await _assert_account_owned(db, user_id, data.account_id)
        txn = Transaction(
            user_id=user_id,
            account_id=data.account_id,
            # "lent" = money left the account (expense); "borrowed" = it came in (income).
            kind="expense" if data.direction == "lent" else "income",
            amount=data.amount,
            note=data.note or f"{'Lent to' if data.direction == 'lent' else 'Borrowed from'} {data.person_name}",
            occurred_on=given_on,
        )
        db.add(txn)
        await db.flush()

    lending = Lending(
        user_id=user_id,
        person_name=data.person_name,
        phone_number=data.phone_number,
        direction=data.direction,
        amount=data.amount,
        given_on=given_on,
        remind_on=data.remind_on,
        note=data.note,
        transaction_id=txn.id if txn else None,
    )
    db.add(lending)
    await db.commit()
    await db.refresh(lending)
    return lending


async def get_lending(db: AsyncSession, user_id: UUID, lending_id: UUID) -> Lending:
    lending = await db.scalar(select(Lending).where(Lending.id == lending_id, Lending.user_id == user_id))
    if lending is None:
        raise FinanceNotFound("Lending record not found")
    return lending


async def update_lending(db: AsyncSession, user_id: UUID, lending_id: UUID, data: LendingUpdate) -> Lending:
    lending = await get_lending(db, user_id, lending_id)
    updates = data.model_dump(exclude_unset=True)
    if "amount" in updates and lending.transaction_id is not None:
        # The linked transaction already moved the account balance once at this
        # amount — correcting a typo here without correcting that would leave
        # the balance wrong in the opposite direction.
        txn = await db.get(Transaction, lending.transaction_id)
        if txn is not None:
            txn.amount = updates["amount"]
    for field, value in updates.items():
        setattr(lending, field, value)
    await db.commit()
    await db.refresh(lending)
    return lending


async def settle_lending(db: AsyncSession, user_id: UUID, lending_id: UUID) -> Lending:
    lending = await get_lending(db, user_id, lending_id)
    lending.is_settled = True
    lending.settled_on = date.today()
    await db.commit()
    await db.refresh(lending)
    return lending


async def delete_lending(db: AsyncSession, user_id: UUID, lending_id: UUID) -> None:
    lending = await get_lending(db, user_id, lending_id)
    await db.delete(lending)
    await db.commit()


# --- Analytics ----------------------------------------------------------------
# Deterministic SQL aggregation only — no room for an LLM to "estimate" a total.


async def spend_trend(db: AsyncSession, user_id: UUID, days: int = 30) -> list[dict]:
    start = date.today() - timedelta(days=days - 1)
    rows = (
        await db.execute(
            select(Transaction.occurred_on, func.sum(Transaction.amount))
            .where(
                Transaction.user_id == user_id,
                Transaction.kind == "expense",
                Transaction.occurred_on >= start,
            )
            .group_by(Transaction.occurred_on)
        )
    ).all()
    totals_by_day = {row[0]: float(row[1]) for row in rows}
    return [
        {"date": start + timedelta(days=i), "total": totals_by_day.get(start + timedelta(days=i), 0.0)}
        for i in range(days)
    ]


async def category_breakdown(db: AsyncSession, user_id: UUID, days: int = 30) -> list[dict]:
    start = date.today() - timedelta(days=days - 1)
    category_name = func.coalesce(TransactionCategory.name, "Uncategorized").label("category_name")
    rows = (
        await db.execute(
            select(category_name, func.sum(Transaction.amount))
            .select_from(Transaction)
            .outerjoin(TransactionCategory, Transaction.category_id == TransactionCategory.id)
            .where(
                Transaction.user_id == user_id,
                Transaction.kind == "expense",
                Transaction.occurred_on >= start,
            )
            .group_by(category_name)
            .order_by(func.sum(Transaction.amount).desc())
        )
    ).all()
    return [{"category_name": row[0], "total": float(row[1])} for row in rows]


async def account_breakdown(db: AsyncSession, user_id: UUID, days: int = 30) -> list[dict]:
    start = date.today() - timedelta(days=days - 1)
    rows = (
        await db.execute(
            select(FinancialAccount.name, FinancialAccount.account_type, func.sum(Transaction.amount))
            .select_from(Transaction)
            .join(FinancialAccount, Transaction.account_id == FinancialAccount.id)
            .where(
                Transaction.user_id == user_id,
                Transaction.kind == "expense",
                Transaction.occurred_on >= start,
            )
            .group_by(FinancialAccount.id, FinancialAccount.name, FinancialAccount.account_type)
            .order_by(func.sum(Transaction.amount).desc())
        )
    ).all()
    return [{"account_name": row[0], "account_type": row[1], "total": float(row[2])} for row in rows]


async def finance_summary(db: AsyncSession, user_id: UUID) -> dict:
    accounts = (await db.scalars(select(FinancialAccount).where(FinancialAccount.user_id == user_id))).all()

    total_balance = 0.0
    total_credit_card_debt = 0.0
    for account in accounts:
        income, expense = await _income_expense_totals(db, account.id)
        if account.account_type == "credit_card":
            total_credit_card_debt += float(account.opening_balance) + expense - income
        else:
            total_balance += float(account.opening_balance) + income - expense

    month_start = date.today().replace(day=1)
    spent, earned = (
        await db.execute(
            select(
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == "expense"), 0),
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == "income"), 0),
            ).where(Transaction.user_id == user_id, Transaction.occurred_on >= month_start)
        )
    ).one()

    lent_this_month = await db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .select_from(Transaction)
        .join(Lending, Lending.transaction_id == Transaction.id)
        .where(
            Transaction.user_id == user_id,
            Transaction.occurred_on >= month_start,
            Lending.direction == "lent",
        )
    )

    outstanding_lent = await db.scalar(
        select(func.coalesce(func.sum(Lending.amount), 0)).where(
            Lending.user_id == user_id, Lending.direction == "lent", Lending.is_settled.is_(False)
        )
    )
    outstanding_borrowed = await db.scalar(
        select(func.coalesce(func.sum(Lending.amount), 0)).where(
            Lending.user_id == user_id, Lending.direction == "borrowed", Lending.is_settled.is_(False)
        )
    )

    top_accounts = await account_breakdown(db, user_id, days=30)

    return {
        "total_balance": total_balance,
        "total_credit_card_debt": total_credit_card_debt,
        "net_worth": total_balance - total_credit_card_debt,
        "spent_this_month": float(spent),
        "spent_this_month_excluding_lending": float(spent) - float(lent_this_month or 0),
        "income_this_month": float(earned),
        "outstanding_lent": float(outstanding_lent or 0),
        "outstanding_borrowed": float(outstanding_borrowed or 0),
        "top_spend_account": top_accounts[0] if top_accounts else None,
    }
