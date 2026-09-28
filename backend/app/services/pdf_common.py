"""Shared building blocks for every diary-styled PDF report (day, month,
all-time) — one font registration, one ruled-paper background, one currency
formatter, so the reports all look and behave like pages of the same diary
rather than independently-styled documents."""

import os
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "fonts", "Caveat-Variable.ttf")
INK = colors.HexColor("#2b3a67")
INK_SOFT = colors.HexColor("#4a4a4a")
HIGHLIGHT_BG = colors.HexColor("#fff3c4")
RULE_LINE = colors.HexColor("#dfe3ee")
EXPENSE = colors.HexColor("#b3261e")
INCOME = colors.HexColor("#1a7a42")

_fonts_registered = False


def ensure_fonts() -> None:
    global _fonts_registered
    if not _fonts_registered:
        pdfmetrics.registerFont(TTFont("Caveat", FONT_PATH))
        _fonts_registered = True


def rupees(amount: Decimal) -> str:
    # Not the "₹" glyph — reportlab's base-14 fonts don't contain it, so it
    # would render as a tofu box instead of failing loudly.
    return f"Rs {amount:,.0f}"


def draw_ruled_page(canvas, doc) -> None:
    """Faint ruled-notebook-paper background, redrawn on every page a report spans."""
    canvas.saveState()
    canvas.setStrokeColor(RULE_LINE)
    canvas.setLineWidth(0.6)
    y = doc.pagesize[1] - 1.3 * inch
    while y > 0.6 * inch:
        canvas.line(0.5 * inch, y, doc.pagesize[0] - 0.5 * inch, y)
        y -= 0.28 * inch
    canvas.setStrokeColor(colors.HexColor("#f2c9c9"))
    canvas.setLineWidth(1)
    canvas.line(1.15 * inch, doc.pagesize[1] - 0.4 * inch, 1.15 * inch, 0.5 * inch)
    canvas.restoreState()
