from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db.session import get_db
from app.schemas.capture import (
    CaptureKeyCreated,
    CaptureKeyStatus,
    SmsCaptureConfirm,
    SmsCaptureOut,
    SmsIn,
    SmsIngestResult,
)
from app.services import sms_capture as service
from app.services.finance import FinanceNotFound, FinanceValidationError

router = APIRouter(prefix="/capture", tags=["capture"])
settings = get_settings()


@router.post("/sms", response_model=SmsIngestResult)
@limiter.limit(lambda: settings.sms_capture_rate_limit)
async def ingest_sms(
    request: Request,
    payload: SmsIn,
    x_daybook_key: str = Header(),
    db: AsyncSession = Depends(get_db),
):
    """Called by the phone's automation, not the app — authenticated by the
    per-user capture key rather than a login session."""
    try:
        return {"status": await service.ingest(db, x_daybook_key, payload.text, payload.sender)}
    except service.InvalidCaptureKey:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown capture key")


@router.get("/key", response_model=CaptureKeyStatus)
async def key_status(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await service.key_status(db, user_id)


@router.post("/key", response_model=CaptureKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_key(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return {"key": await service.create_key(db, user_id)}


@router.delete("/key", status_code=status.HTTP_204_NO_CONTENT)
async def delete_key(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    await service.delete_key(db, user_id)


@router.get("/pending", response_model=list[SmsCaptureOut])
async def list_pending(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await service.list_pending(db, user_id)


@router.post("/{capture_id}/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def confirm(
    capture_id: UUID,
    payload: SmsCaptureConfirm,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        await service.confirm(db, user_id, capture_id, payload)
    except FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except FinanceValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{capture_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss(
    capture_id: UUID, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    try:
        await service.dismiss(db, user_id, capture_id)
    except FinanceNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
