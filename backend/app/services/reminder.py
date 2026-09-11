"""Builds tap-to-send reminder links. Nothing here ever sends a message on its
own — it hands back a pre-filled `sms:` and `https://wa.me/` link for the
frontend to open, so this account never touches anyone else's number without
the user explicitly tapping the link themselves."""

import re
from urllib.parse import quote

from app.models.finance import Lending


def _digits_only(phone_number: str) -> str:
    return re.sub(r"\D", "", phone_number)


def build_reminder_message(lending: Lending) -> str:
    amount = f"{lending.amount:.0f}"
    if lending.direction == "lent":
        return f"Hey {lending.person_name}, just a friendly reminder about the ₹{amount} I lent you on {lending.given_on}. Whenever you get a chance!"
    return f"Hey {lending.person_name}, reminder that I still owe you ₹{amount} from {lending.given_on} — will sort it out soon."


def build_reminder_links(lending: Lending) -> dict[str, str] | None:
    if not lending.phone_number:
        return None
    digits = _digits_only(lending.phone_number)
    message = build_reminder_message(lending)
    encoded = quote(message)
    return {
        "message": message,
        "sms_link": f"sms:{digits}?body={encoded}",
        "whatsapp_link": f"https://wa.me/{digits}?text={encoded}",
    }
