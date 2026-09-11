from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.schemas.dashboard import TodaySummary
from app.services.dashboard import get_today_summary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/today", response_model=TodaySummary)
async def today(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await get_today_summary(db, user_id)
