import io
import os
from datetime import date
from decimal import Decimal
from uuid import UUID

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.finance import FinancialAccount, Lending, Transaction, TransactionCategory
from app.models.fitness import ExerciseSet, WorkoutSession
from app.models.habit import Habit, HabitCompletion
from app.models.routine import Routine, RoutineCompletion, RoutineItem

_FONT_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "fonts", "Caveat-Variable.ttf")
_INK = colors.HexColor("#2b3a67")
_INK_SOFT = colors.HexColor("#4a4a4a")
_HIGHLIGHT_BG = colors.HexColor("#fff3c4")
_RULE_LINE = colors.HexColor("#dfe3ee")
_EXPENSE = colors.HexColor("#b3261e")
_INCOME = colors.HexColor("#1a7a42")

_fonts_registered = False


def _ensure_fonts() -> None:
    global _fonts_registered
    if not _fonts_registered:
        pdfmetrics.registerFont(TTFont("Caveat", _FONT_PATH))
        _fonts_registered = True


async def build_day_report(db: AsyncSession, user_id: UUID, report_date: date) -> dict:
    """One-stop aggregation across every domain for a single calendar day — the
    data backing both the JSON preview and the PDF export, so the two can never
    show different numbers for the same date."""

    routine_rows = (
        await db.execute(
            select(Routine.name, RoutineItem.title)
            .select_from(RoutineCompletion)
            .join(RoutineItem, RoutineCompletion.routine_item_id == RoutineItem.id)
            .join(Routine, RoutineItem.routine_id == Routine.id)
            .where(Routine.user_id == user_id, RoutineCompletion.completed_on == report_date)
            .order_by(Routine.sort_order, RoutineItem.sort_order)
        )
    ).all()
    routine_items_total = await db.scalar(
        select(func.count(RoutineItem.id))
        .select_from(RoutineItem)
        .join(Routine, RoutineItem.routine_id == Routine.id)
        .where(Routine.user_id == user_id)
    )

    habit_rows = (
        await db.execute(
            select(Habit.name)
            .select_from(HabitCompletion)
            .join(Habit, HabitCompletion.habit_id == Habit.id)
            .where(Habit.user_id == user_id, HabitCompletion.completed_on == report_date)
            .order_by(Habit.name)
        )
    ).all()
    habits_total = await db.scalar(
        select(func.count(Habit.id)).where(Habit.user_id == user_id, Habit.is_archived.is_(False))
    )

    category_name = func.coalesce(TransactionCategory.name, "Uncategorized").label("category_name")
    txn_rows = (
        await db.execute(
            select(
                FinancialAccount.name,
                category_name,
                Transaction.kind,
                Transaction.amount,
                Transaction.note,
            )
            .select_from(Transaction)
            .join(FinancialAccount, Transaction.account_id == FinancialAccount.id)
            .outerjoin(TransactionCategory, Transaction.category_id == TransactionCategory.id)
            .where(Transaction.user_id == user_id, Transaction.occurred_on == report_date)
            .order_by(Transaction.created_at)
        )
    ).all()
    total_spent = sum((r.amount for r in txn_rows if r.kind == "expense"), Decimal(0))
    total_income = sum((r.amount for r in txn_rows if r.kind == "income"), Decimal(0))

    sessions = (
        await db.scalars(
            select(WorkoutSession)
            .options(selectinload(WorkoutSession.sets).selectinload(ExerciseSet.exercise))
            .where(WorkoutSession.user_id == user_id, WorkoutSession.performed_on == report_date)
        )
    ).all()

    lending_rows = (
        await db.execute(
            select(Lending.person_name, Lending.direction, Lending.amount).where(
                Lending.user_id == user_id, Lending.given_on == report_date
            )
        )
    ).all()

    return {
        "report_date": report_date,
        "routine_items_done": [
            {"routine_name": r.name, "item_title": r.title} for r in routine_rows
        ],
        "routine_items_total": routine_items_total or 0,
        "habits_done": [{"name": h.name} for h in habit_rows],
        "habits_total": habits_total or 0,
        "transactions": [
            {
                "account_name": t.name,
                "category_name": t.category_name,
                "kind": t.kind,
                "amount": t.amount,
                "note": t.note,
            }
            for t in txn_rows
        ],
        "total_spent": total_spent,
        "total_income": total_income,
        "workouts": [
            {
                "name": s.name,
                "duration_minutes": s.duration_minutes,
                "notes": s.notes,
                "sets": [
                    {
                        "exercise_name": st.exercise.name,
                        "reps": st.reps,
                        "weight_kg": st.weight_kg,
                    }
                    for st in s.sets
                ],
            }
            for s in sessions
        ],
        "lendings": [
            {"person_name": l.person_name, "direction": l.direction, "amount": l.amount}
            for l in lending_rows
        ],
    }


def _rupees(amount: Decimal) -> str:
    # Not the "₹" glyph — reportlab's base-14 fonts don't contain it, so it
    # would render as a tofu box instead of failing loudly.
    return f"Rs {amount:,.0f}"


def _draw_ruled_page(canvas, doc) -> None:
    """Faint ruled-notebook-paper background, redrawn on every page this report spans."""
    canvas.saveState()
    canvas.setStrokeColor(_RULE_LINE)
    canvas.setLineWidth(0.6)
    y = doc.pagesize[1] - 1.3 * inch
    while y > 0.6 * inch:
        canvas.line(0.5 * inch, y, doc.pagesize[0] - 0.5 * inch, y)
        y -= 0.28 * inch
    canvas.setStrokeColor(colors.HexColor("#f2c9c9"))
    canvas.setLineWidth(1)
    canvas.line(1.15 * inch, doc.pagesize[1] - 0.4 * inch, 1.15 * inch, 0.5 * inch)
    canvas.restoreState()


def render_day_report_pdf(data: dict) -> bytes:
    """Renders the diary-page PDF from the dict build_day_report() produces —
    kept as a pure function of that data so the JSON preview and the PDF export
    are guaranteed to agree on the same numbers."""
    _ensure_fonts()

    heading_style = ParagraphStyle(
        "Heading",
        fontName="Caveat",
        fontSize=22,
        leading=30,
        textColor=_INK,
        spaceBefore=16,
        spaceAfter=10,
    )
    title_style = ParagraphStyle(
        "Title", fontName="Caveat", fontSize=40, textColor=_INK, spaceAfter=4, leading=44
    )
    body_style = ParagraphStyle(
        "Body", fontName="Helvetica", fontSize=10.5, textColor=_INK_SOFT, leading=15
    )
    empty_style = ParagraphStyle(
        "Empty", fontName="Helvetica-Oblique", fontSize=10, textColor=colors.grey, leftIndent=14
    )
    highlight_style = ParagraphStyle(
        "Highlight", fontName="Helvetica-Bold", fontSize=11, textColor=_INK, leading=16
    )

    story: list = []
    d: date = data["report_date"]
    story.append(Paragraph(d.strftime("%A, %B %-d, %Y"), title_style))
    story.append(Spacer(1, 6))

    # --- Pinned highlights: the at-a-glance summary of the whole day ---
    routine_done, routine_total = len(data["routine_items_done"]), data["routine_items_total"]
    habits_done, habits_total = len(data["habits_done"]), data["habits_total"]
    highlight_bits = []
    if routine_total:
        highlight_bits.append(f"✓ Routine {routine_done}/{routine_total}")
    if habits_total:
        highlight_bits.append(f"✓ Habits {habits_done}/{habits_total}")
    if data["total_spent"]:
        highlight_bits.append(f"Spent {_rupees(data['total_spent'])}")
    if data["total_income"]:
        highlight_bits.append(f"Income {_rupees(data['total_income'])}")
    if data["workouts"]:
        highlight_bits.append("Workout logged")
    highlight_text = "   ·   ".join(highlight_bits) if highlight_bits else "A quiet day — nothing logged."
    highlight_table = Table(
        [[Paragraph(highlight_text, highlight_style)]],
        colWidths=[6.5 * inch],
    )
    highlight_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _HIGHLIGHT_BG),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e8d68a")),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(highlight_table)
    story.append(Spacer(1, 10))

    # --- Routine ---
    story.append(Paragraph("Routine", heading_style))
    if data["routine_items_done"]:
        for item in data["routine_items_done"]:
            story.append(Paragraph(f"✓ {item['item_title']} — {item['routine_name']}", body_style))
    else:
        story.append(Paragraph("Nothing checked off that day.", empty_style))

    # --- Habits ---
    story.append(Paragraph("Habits", heading_style))
    if data["habits_done"]:
        for habit in data["habits_done"]:
            story.append(Paragraph(f"✓ {habit['name']}", body_style))
    else:
        story.append(Paragraph("No habits marked done.", empty_style))

    # --- Finance ---
    story.append(Paragraph("Finance", heading_style))
    if data["transactions"]:
        for t in data["transactions"]:
            sign = "−" if t["kind"] == "expense" else "+"
            color = _EXPENSE if t["kind"] == "expense" else _INCOME
            label = t["note"] or t["category_name"] or "Uncategorized"
            story.append(
                Paragraph(
                    f'{label} <font color="grey">({t["account_name"]})</font> '
                    f'<font color="{color.hexval()}"><b>{sign}{_rupees(t["amount"])}</b></font>',
                    body_style,
                )
            )
        net = data["total_income"] - data["total_spent"]
        net_word = "ahead" if net >= 0 else "spent net"
        story.append(Spacer(1, 4))
        story.append(Paragraph(f"<b>Net: {_rupees(abs(net))} {net_word}</b>", highlight_style))
    else:
        story.append(Paragraph("No transactions logged.", empty_style))

    # --- Fitness ---
    story.append(Paragraph("Fitness", heading_style))
    if data["workouts"]:
        for w in data["workouts"]:
            title = w["name"]
            if w["duration_minutes"]:
                title += f" — {w['duration_minutes']} min"
            story.append(Paragraph(f"<b>{title}</b>", body_style))
            for s in w["sets"]:
                weight = f" × {s['weight_kg']}kg" if s["weight_kg"] else ""
                story.append(Paragraph(f"&nbsp;&nbsp;• {s['exercise_name']} — {s['reps']} reps{weight}", body_style))
            if w["notes"]:
                story.append(Paragraph(f"&nbsp;&nbsp;<i>{w['notes']}</i>", body_style))
    else:
        story.append(Paragraph("No workout logged.", empty_style))

    # --- Lending (only shown if relevant that day) ---
    if data["lendings"]:
        story.append(Paragraph("Lending", heading_style))
        for entry in data["lendings"]:
            verb = "lent to" if entry["direction"] == "lent" else "borrowed from"
            story.append(Paragraph(f"{_rupees(entry['amount'])} {verb} {entry['person_name']}", body_style))

    story.append(Spacer(1, 24))
    story.append(Paragraph("— that was the day. — Daybook", ParagraphStyle(
        "Closing", fontName="Caveat", fontSize=16, textColor=colors.grey, alignment=1
    )))

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=1.3 * inch,
        bottomMargin=0.7 * inch,
        leftMargin=1.4 * inch,
        rightMargin=0.7 * inch,
    )
    doc.build(story, onFirstPage=_draw_ruled_page, onLaterPages=_draw_ruled_page)
    return buffer.getvalue()
