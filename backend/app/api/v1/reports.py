from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.schemas.reports import DayReportOut
from app.services.day_report import build_day_report, render_day_report_pdf

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/day/{report_date}", response_model=DayReportOut)
async def get_day_report(
    report_date: date, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    return await build_day_report(db, user_id, report_date)


@router.get("/day/{report_date}/pdf")
async def get_day_report_pdf(
    report_date: date, user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
):
    data = await build_day_report(db, user_id, report_date)
    pdf_bytes = render_day_report_pdf(data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="daybook-{report_date.isoformat()}.pdf"'},
    )
