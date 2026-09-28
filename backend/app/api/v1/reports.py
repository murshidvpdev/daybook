from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.session import get_db
from app.schemas.reports import DayReportOut, PeriodReportOut
from app.services.day_report import build_day_report, render_day_report_pdf
from app.services.month_report import (
    build_all_time_report,
    build_month_report,
    render_period_report_pdf,
)

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


@router.get("/month/{year}/{month}", response_model=PeriodReportOut)
async def get_month_report(
    year: int = Path(ge=2000, le=2200),
    month: int = Path(ge=1, le=12),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return await build_month_report(db, user_id, year, month)


@router.get("/month/{year}/{month}/pdf")
async def get_month_report_pdf(
    year: int = Path(ge=2000, le=2200),
    month: int = Path(ge=1, le=12),
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    data = await build_month_report(db, user_id, year, month)
    pdf_bytes = render_period_report_pdf(data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="daybook-{year:04d}-{month:02d}.pdf"'},
    )


@router.get("/all", response_model=PeriodReportOut)
async def get_all_time_report(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await build_all_time_report(db, user_id)


@router.get("/all/pdf")
async def get_all_time_report_pdf(user_id: UUID = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    data = await build_all_time_report(db, user_id)
    pdf_bytes = render_period_report_pdf(data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="daybook-all-time.pdf"'},
    )
