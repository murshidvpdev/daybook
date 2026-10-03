import calendar
import io
from datetime import date
from decimal import Decimal
from uuid import UUID

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import NOT_TRANSFER, Lending, LendingPayment, Transaction, TransactionCategory
from app.models.fitness import ExerciseSet, WorkoutSession
from app.models.habit import Habit, HabitCompletion
from app.models.routine import Routine, RoutineCompletion, RoutineItem
from app.services import pdf_common as pdfc


def month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


async def build_period_report(
    db: AsyncSession, user_id: UUID, label: str, start: date | None, end: date | None
) -> dict:
    """Aggregates every domain over an arbitrary period — a specific month, or
    the user's entire history when start/end are both None. Shares the same
    shape either way so the frontend and the PDF renderer don't need to know
    which case they're looking at."""

    def _in_range(column):
        conditions = []
        if start is not None:
            conditions.append(column >= start)
        if end is not None:
            conditions.append(column <= end)
        return conditions

    routine_completions = await db.scalar(
        select(func.count(RoutineCompletion.id))
        .select_from(RoutineCompletion)
        .join(RoutineItem, RoutineCompletion.routine_item_id == RoutineItem.id)
        .join(Routine, RoutineItem.routine_id == Routine.id)
        .where(Routine.user_id == user_id, *_in_range(RoutineCompletion.completed_on))
    )

    habits_completed = await db.scalar(
        select(func.count(HabitCompletion.id))
        .select_from(HabitCompletion)
        .join(Habit, HabitCompletion.habit_id == Habit.id)
        .where(Habit.user_id == user_id, *_in_range(HabitCompletion.completed_on))
    )

    txn_totals = (
        await db.execute(
            select(
                func.count(Transaction.id),
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == "expense", NOT_TRANSFER), 0),
                func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == "income", NOT_TRANSFER), 0),
            ).where(Transaction.user_id == user_id, *_in_range(Transaction.occurred_on))
        )
    ).one()
    transactions_count, total_spent, total_income = txn_totals

    category_name = func.coalesce(TransactionCategory.name, "Uncategorized").label("category_name")
    top_category_row = (
        await db.execute(
            select(category_name, func.sum(Transaction.amount).label("total"))
            .select_from(Transaction)
            .outerjoin(TransactionCategory, Transaction.category_id == TransactionCategory.id)
            .where(
                Transaction.user_id == user_id,
                Transaction.kind == "expense",
                NOT_TRANSFER,
                *_in_range(Transaction.occurred_on),
            )
            .group_by(category_name)
            .order_by(func.sum(Transaction.amount).desc())
            .limit(1)
        )
    ).first()

    workouts_count = await db.scalar(
        select(func.count(WorkoutSession.id)).where(
            WorkoutSession.user_id == user_id, *_in_range(WorkoutSession.performed_on)
        )
    )
    total_sets = await db.scalar(
        select(func.count(ExerciseSet.id))
        .select_from(ExerciseSet)
        .join(WorkoutSession, ExerciseSet.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == user_id, *_in_range(WorkoutSession.performed_on))
    )

    lending_given = await db.scalar(
        select(func.coalesce(func.sum(Lending.amount), 0)).where(
            Lending.user_id == user_id, Lending.direction == "lent", *_in_range(Lending.given_on)
        )
    )
    lending_borrowed = await db.scalar(
        select(func.coalesce(func.sum(Lending.amount), 0)).where(
            Lending.user_id == user_id, Lending.direction == "borrowed", *_in_range(Lending.given_on)
        )
    )
    lending_repaid = await db.scalar(
        select(func.coalesce(func.sum(LendingPayment.amount), 0)).where(
            LendingPayment.user_id == user_id, *_in_range(LendingPayment.paid_on)
        )
    )

    return {
        "label": label,
        "start_date": start,
        "end_date": end,
        "routine_completions": routine_completions or 0,
        "habits_completed": habits_completed or 0,
        "transactions_count": transactions_count or 0,
        "total_spent": Decimal(str(total_spent)),
        "total_income": Decimal(str(total_income)),
        "net": Decimal(str(total_income)) - Decimal(str(total_spent)),
        "top_category": (
            {"category_name": top_category_row.category_name, "total": top_category_row.total}
            if top_category_row
            else None
        ),
        "workouts_count": workouts_count or 0,
        "total_sets": total_sets or 0,
        "lending_given": Decimal(str(lending_given)),
        "lending_borrowed": Decimal(str(lending_borrowed)),
        "lending_repaid": Decimal(str(lending_repaid)),
    }


async def build_month_report(db: AsyncSession, user_id: UUID, year: int, month: int) -> dict:
    start, end = month_bounds(year, month)
    label = f"{calendar.month_name[month]} {year}"
    return await build_period_report(db, user_id, label, start, end)


async def build_all_time_report(db: AsyncSession, user_id: UUID) -> dict:
    return await build_period_report(db, user_id, "All time", None, None)


def render_period_report_pdf(data: dict) -> bytes:
    """A one-page digest — summary stats, not an itemized list like the day
    report, since a month (or a lifetime) of individual transactions and
    routine ticks would run for pages and stop being readable as a diary."""
    pdfc.ensure_fonts()

    title_style = ParagraphStyle(
        "Title", fontName="Caveat", fontSize=40, textColor=pdfc.INK, spaceAfter=4, leading=44
    )
    heading_style = ParagraphStyle(
        "Heading", fontName="Caveat", fontSize=22, leading=30, textColor=pdfc.INK, spaceBefore=16, spaceAfter=10
    )
    body_style = ParagraphStyle("Body", fontName="Helvetica", fontSize=11, textColor=pdfc.INK_SOFT, leading=17)
    highlight_style = ParagraphStyle(
        "Highlight", fontName="Helvetica-Bold", fontSize=11, textColor=pdfc.INK, leading=16
    )

    story: list = []
    story.append(Paragraph(data["label"], title_style))
    if data["start_date"] and data["end_date"]:
        story.append(
            Paragraph(
                f"{data['start_date'].strftime('%b %-d')} – {data['end_date'].strftime('%b %-d, %Y')}",
                ParagraphStyle("Sub", fontName="Helvetica", fontSize=10, textColor=colors.grey),
            )
        )
    story.append(Spacer(1, 10))

    net = data["net"]
    net_word = "ahead" if net >= 0 else "behind"
    highlight_text = (
        f"Spent {pdfc.rupees(data['total_spent'])}   ·   Income {pdfc.rupees(data['total_income'])}"
        f"   ·   Net {pdfc.rupees(abs(net))} {net_word}"
    )
    highlight_table = Table([[Paragraph(highlight_text, highlight_style)]], colWidths=[6.5 * inch])
    highlight_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), pdfc.HIGHLIGHT_BG),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e8d68a")),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(highlight_table)

    story.append(Paragraph("Routine &amp; habits", heading_style))
    story.append(Paragraph(f"{data['routine_completions']} routine items checked off", body_style))
    story.append(Paragraph(f"{data['habits_completed']} habit check-ins", body_style))

    story.append(Paragraph("Finance", heading_style))
    story.append(Paragraph(f"{data['transactions_count']} transactions logged", body_style))
    if data["top_category"]:
        story.append(
            Paragraph(
                f"Biggest category: {data['top_category']['category_name']} "
                f"({pdfc.rupees(data['top_category']['total'])})",
                body_style,
            )
        )
    if data["lending_given"] or data["lending_borrowed"] or data["lending_repaid"]:
        story.append(Paragraph("Lending", heading_style))
        if data["lending_given"]:
            story.append(Paragraph(f"Lent out: {pdfc.rupees(data['lending_given'])}", body_style))
        if data["lending_borrowed"]:
            story.append(Paragraph(f"Borrowed: {pdfc.rupees(data['lending_borrowed'])}", body_style))
        if data["lending_repaid"]:
            story.append(Paragraph(f"Repaid (either direction): {pdfc.rupees(data['lending_repaid'])}", body_style))

    story.append(Paragraph("Fitness", heading_style))
    if data["workouts_count"]:
        story.append(Paragraph(f"{data['workouts_count']} workouts, {data['total_sets']} sets logged", body_style))
    else:
        story.append(
            Paragraph(
                "No workouts logged.",
                ParagraphStyle("Empty", fontName="Helvetica-Oblique", fontSize=10, textColor=colors.grey),
            )
        )

    story.append(Spacer(1, 24))
    story.append(
        Paragraph(
            f"— {data['label']}, in one page. — Daybook",
            ParagraphStyle("Closing", fontName="Caveat", fontSize=16, textColor=colors.grey, alignment=1),
        )
    )

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=1.3 * inch,
        bottomMargin=0.7 * inch,
        leftMargin=1.4 * inch,
        rightMargin=0.7 * inch,
    )
    doc.build(story, onFirstPage=pdfc.draw_ruled_page, onLaterPages=pdfc.draw_ruled_page)
    return buffer.getvalue()
