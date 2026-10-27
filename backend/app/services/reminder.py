"""Builds tap-to-send reminder links. Nothing here ever sends a message on its
own — it hands back a pre-filled `sms:` and `https://wa.me/` link for the
frontend to open, so this account never touches anyone else's number without
the user explicitly tapping the link themselves."""

import re
from datetime import date
from decimal import Decimal
from urllib.parse import quote

from app.models.finance import Lending


def _digits_only(phone_number: str) -> str:
    digits = re.sub(r"\D", "", phone_number)
    # wa.me needs the country code; a bare 10-digit Indian mobile (or one with
    # a leading 0) gets +91, which is how most numbers here are typed.
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        digits = f"91{digits}"
    return digits


def _rupees(amount: Decimal) -> str:
    return f"₹{amount:,.0f}"


def _day(d: date) -> str:
    return f"{d.day} {d:%b}"


def _paid(lending: Lending) -> Decimal:
    return sum((Decimal(str(p.amount)) for p in lending.payments), Decimal(0))


def build_reminder_message(lending: Lending) -> str:
    """Asks only for what's still left — a friend who's paid part of it back
    shouldn't be reminded of the full amount again."""
    total = Decimal(str(lending.amount))
    paid = _paid(lending)
    left = total - paid
    if lending.direction == "lent":
        if paid > 0:
            return (
                f"Hey {lending.person_name}, just a friendly reminder — {_rupees(left)} is still pending from the "
                f"{_rupees(total)} I lent you on {_day(lending.given_on)} (got {_rupees(paid)} already, thanks!). "
                "Whenever you get a chance!"
            )
        return (
            f"Hey {lending.person_name}, just a friendly reminder about the {_rupees(total)} I lent you on "
            f"{_day(lending.given_on)}. Whenever you get a chance!"
        )
    return (
        f"Hey {lending.person_name}, reminder that I still owe you {_rupees(left)} from {_day(lending.given_on)} — "
        "will sort it out soon."
    )


def build_person_reminder_message(name: str, lendings: list[Lending]) -> str | None:
    """One message for everything a friend still owes, across every time they borrowed."""
    open_lent = [lending for lending in lendings if lending.direction == "lent" and not lending.is_settled]
    left = sum((Decimal(str(lending.amount)) - _paid(lending) for lending in open_lent), Decimal(0))
    if left <= 0:
        return None
    if len(open_lent) == 1:
        return build_reminder_message(open_lent[0])
    paid = sum((_paid(lending) for lending in open_lent), Decimal(0))
    parts = ", ".join(
        f"{_rupees(Decimal(str(lending.amount)))} on {_day(lending.given_on)}"
        for lending in sorted(open_lent, key=lambda lending: lending.given_on)
    )
    thanks = f"; got {_rupees(paid)} back already, thanks!" if paid > 0 else ""
    return (
        f"Hey {name}, just a friendly reminder — {_rupees(left)} is still pending in total ({parts}{thanks}). "
        "Whenever you get a chance!"
    )


def links_for(phone_number: str | None, message: str | None) -> dict[str, str] | None:
    if not phone_number or not message:
        return None
    digits = _digits_only(phone_number)
    encoded = quote(message)
    return {
        "message": message,
        "sms_link": f"sms:{digits}?body={encoded}",
        "whatsapp_link": f"https://wa.me/{digits}?text={encoded}",
    }


def build_reminder_links(lending: Lending) -> dict[str, str] | None:
    return links_for(lending.phone_number, build_reminder_message(lending))
