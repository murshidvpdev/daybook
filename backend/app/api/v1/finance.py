from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.schemas.finance import (
    AccountBreakdownItem,
    AccountCreate,
    AccountOut,
    CategoryBreakdownItem,
    CategoryCreate,
    CategoryOut,
    CreditCardBillOut,
    CreditCardCreate,
    CreditCardOut,
    CreditCardSpendCreate,
    CreditCardSpendResult,
    EMICreate,
    EMIOut,
    FinanceSummaryOut,
    LendingCreate,
    LendingOut,
    ReminderLinksOut,
    SIPCreate,
    SIPOut,
    SpendTrendPoint,
    TransactionCreate,
    TransactionOut,
)
from app.services import finance as service
from app.services.reminder import build_reminder_links

router = APIRouter(prefix="/finance", tags=["finance"])


@router.get("/accounts", response_model=list[AccountOut])
async def list_accounts(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await service.list_accounts(db, user_id)


@router.post("/accounts", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(
    payload: AccountCreate, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    return await service.create_account(db, user_id, payload)


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await service.list_categories(db, user_id)


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: CategoryCreate, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    return await service.create_category(db, user_id, payload)


@router.get("/transactions", response_model=list[TransactionOut])
async def list_transactions(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await service.list_transactions(db, user_id)


@router.post("/transactions", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    payload: TransactionCreate, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        return await service.create_transaction(db, user_id, payload)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        await service.delete_transaction(db, user_id, transaction_id)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# --- Credit cards ------------------------------------------------------------


@router.get("/credit-cards", response_model=list[CreditCardOut])
async def list_credit_cards(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await service.list_credit_cards(db, user_id)


@router.post("/credit-cards", response_model=CreditCardOut, status_code=status.HTTP_201_CREATED)
async def create_credit_card(
    payload: CreditCardCreate, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    return await service.create_credit_card(db, user_id, payload)


@router.delete("/credit-cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credit_card(
    card_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        await service.delete_credit_card(db, user_id, card_id)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/credit-cards/{card_id}/spend", response_model=CreditCardSpendResult, status_code=status.HTTP_201_CREATED)
async def spend_on_credit_card(
    card_id: UUID,
    payload: CreditCardSpendCreate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        txn, lending = await service.spend_on_credit_card(db, user_id, card_id, payload)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return {"transaction": txn, "lending": lending}


@router.get("/credit-cards/{card_id}/bills", response_model=list[CreditCardBillOut])
async def list_bills(
    card_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        return await service.list_bills(db, user_id, card_id)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/credit-cards/{card_id}/bills", response_model=CreditCardBillOut, status_code=status.HTTP_201_CREATED)
async def generate_bill(
    card_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        return await service.generate_bill(db, user_id, card_id)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except service.FinanceValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/credit-cards/bills/{bill_id}/pay", response_model=CreditCardBillOut)
async def pay_bill(bill_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    try:
        return await service.pay_bill(db, user_id, bill_id)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# --- EMIs ---------------------------------------------------------------------


@router.get("/emis", response_model=list[EMIOut])
async def list_emis(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await service.list_emis(db, user_id)


@router.post("/emis", response_model=EMIOut, status_code=status.HTTP_201_CREATED)
async def create_emi(
    payload: EMICreate, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        return await service.create_emi(db, user_id, payload)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/emis/{emi_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_emi(emi_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    try:
        await service.delete_emi(db, user_id, emi_id)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/emis/{emi_id}/confirm-payment", response_model=EMIOut)
async def confirm_emi_payment(
    emi_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        return await service.confirm_emi_payment(db, user_id, emi_id)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except service.FinanceValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# --- SIPs -----------------------------------------------------------------


@router.get("/sips", response_model=list[SIPOut])
async def list_sips(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await service.list_sips(db, user_id)


@router.post("/sips", response_model=SIPOut, status_code=status.HTTP_201_CREATED)
async def create_sip(
    payload: SIPCreate, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        return await service.create_sip(db, user_id, payload)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/sips/{sip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def stop_sip(sip_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    try:
        await service.stop_sip(db, user_id, sip_id)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# --- Lending (friends) ------------------------------------------------------


@router.get("/lendings", response_model=list[LendingOut])
async def list_lendings(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await service.list_lendings(db, user_id)


@router.post("/lendings", response_model=LendingOut, status_code=status.HTTP_201_CREATED)
async def create_lending(
    payload: LendingCreate, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        return await service.create_lending(db, user_id, payload)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/lendings/{lending_id}/settle", response_model=LendingOut)
async def settle_lending(
    lending_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        return await service.settle_lending(db, user_id, lending_id)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/lendings/{lending_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lending(
    lending_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        await service.delete_lending(db, user_id, lending_id)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/lendings/{lending_id}/reminder", response_model=ReminderLinksOut)
async def lending_reminder(
    lending_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        lending = await service.get_lending(db, user_id, lending_id)
    except service.FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    links = build_reminder_links(lending)
    if links is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No phone number on file for this person")
    return links


# --- Analytics ---------------------------------------------------------------


@router.get("/analytics/spend-trend", response_model=list[SpendTrendPoint])
async def spend_trend(
    days: int = 30, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    return await service.spend_trend(db, user_id, days)


@router.get("/analytics/category-breakdown", response_model=list[CategoryBreakdownItem])
async def category_breakdown(
    days: int = 30, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    return await service.category_breakdown(db, user_id, days)


@router.get("/analytics/account-breakdown", response_model=list[AccountBreakdownItem])
async def account_breakdown(
    days: int = 30, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    return await service.account_breakdown(db, user_id, days)


@router.get("/analytics/summary", response_model=FinanceSummaryOut)
async def finance_summary(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await service.finance_summary(db, user_id)
