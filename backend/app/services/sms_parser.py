"""Reads the transaction out of an Indian bank's SMS.

Pure functions only — no database — so every bank format can be pinned down
in a plain unit test. Banks word these very differently (SBI often drops the
"Rs", ICICI puts the merchant before "credited", Axis packs everything into a
UPI/P2M/... path), so each field is matched independently and any of them may
come back empty; the review list shows the raw SMS alongside whatever was read.
"""

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

_AMOUNT = re.compile(r"(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)", re.IGNORECASE)
# SBI: "A/C X1234 debited by 450.0" — the amount follows "by"/"for" with no currency.
_AMOUNT_BARE = re.compile(r"(?:debited|credited)\s+(?:by|for|with)\s+([\d,]+(?:\.\d{1,2})?)", re.IGNORECASE)

# Never bare "credit"/"debit": "ICICI Bank Credit Card XX6007 debited" must read as a spend.
_DEBIT_WORDS = re.compile(r"\b(debited|spent|sent|paid|withdrawn|purchase|used at)\b", re.IGNORECASE)
_CREDIT_WORDS = re.compile(r"\b(credited|received|deposited|refund(?:ed)?|reversed)\b", re.IGNORECASE)

# Messages that mention money but aren't a completed transaction.
_NOT_A_TRANSACTION = re.compile(
    r"\b(otp|one[- ]time password|will be debited|is due|due on|requested|request from|"
    r"collect request|mandate|autopay .*?(?:set|registered)|failed|declined|statement is ready)\b",
    re.IGNORECASE,
)

_LAST_FOUR = re.compile(
    r"(?:a/?c|acct|account|card)(?:\s*no\.?)?(?:\s+ending)?[\s:.\-]*(?:with\s+)?[x*]*\s*(\d{3,4})\b",
    re.IGNORECASE,
)

_REFERENCE = re.compile(
    r"(?:upi\s*ref(?:erence)?(?:\s*no\.?)?|ref(?:erence)?\s*(?:no\.?|number)?|refno|rrn|txn\s*id|upi)"
    r"[\s:#.\-]*(\d{6,})",
    re.IGNORECASE,
)
_UPI_PATH = re.compile(r"upi/p2[am]/(\d{6,})/([^/\s]+)", re.IGNORECASE)

_COUNTERPARTY_PATTERNS = [
    re.compile(r"\btrf to\s+(.+?)(?:\s+ref|\s+refno|\.|$)", re.IGNORECASE),  # SBI
    re.compile(r";\s*(.+?)\s+credited\b", re.IGNORECASE),  # ICICI: "...on 21-Oct-26; SWIGGY credited"
    re.compile(r"\b(?:from|by|to)\s+vpa\s+([^\s()]+)", re.IGNORECASE),
    re.compile(r"\bupi-\d{6,}-(.+?)\.(?:\s|$)", re.IGNORECASE),  # ICICI card on UPI: "UPI-6290...-HULE CON."
    re.compile(r"\bat\s+(.+?)\s+(?:on|for)\b", re.IGNORECASE),  # "at AMAZON on ..." / HSBC "at X for INR"
    re.compile(r"\bat\s+([^.]+?)\.(?:\s|$)", re.IGNORECASE),  # Axis card: "IST at Ramachandra."
    re.compile(r"\bon\s+\d{1,2}[-/ ]\w{2,3}[-/ ]\d{2,4}\s+(?:at|on)\s+(.+?)(?:\.|\s+avl|$)", re.IGNORECASE),
    re.compile(r"\bto\s+(.+?)\s+(?:on|ref|upi)\b", re.IGNORECASE),  # HDFC: "To SWIGGY On 21/10"
    re.compile(r"\bfrom\s+(.+?)\s+(?:on|ref|upi)\b", re.IGNORECASE),
]


@dataclass
class ParsedSms:
    is_transaction: bool
    amount: Decimal | None = None
    kind: str | None = None  # expense | income
    last_four: str | None = None
    counterparty: str | None = None
    reference: str | None = None


def _to_decimal(text: str) -> Decimal | None:
    try:
        value = Decimal(text.replace(",", ""))
    except InvalidOperation:
        return None
    return value if value > 0 else None


def _clean(name: str) -> str | None:
    name = re.sub(r"\s+", " ", name).strip(" .:;,-")
    return name[:120] or None


def parse_bank_sms(text: str) -> ParsedSms:
    if _NOT_A_TRANSACTION.search(text):
        return ParsedSms(is_transaction=False)

    debit = _DEBIT_WORDS.search(text)
    credit = _CREDIT_WORDS.search(text)
    if not debit and not credit:
        return ParsedSms(is_transaction=False)
    # Whichever comes first describes *your* side: "debited from A/c ... credited
    # to swiggy@icici" is a debit, "credited to A/c ... debited from X" a credit.
    if debit and (not credit or debit.start() < credit.start()):
        kind = "expense"
    else:
        kind = "income"

    amount_match = _AMOUNT.search(text) or _AMOUNT_BARE.search(text)
    amount = _to_decimal(amount_match.group(1)) if amount_match else None
    if amount is None:
        return ParsedSms(is_transaction=False)

    last_four_match = _LAST_FOUR.search(text)
    reference = None
    counterparty = None
    upi_path = _UPI_PATH.search(text)
    if upi_path:
        reference, counterparty = upi_path.group(1), _clean(upi_path.group(2))
    else:
        ref_match = _REFERENCE.search(text)
        reference = ref_match.group(1) if ref_match else None
        for pattern in _COUNTERPARTY_PATTERNS:
            match = pattern.search(text)
            name = _clean(match.group(1)) if match else None
            # Skip captures that are really your own account or a bare date/number.
            if name and not re.fullmatch(r"[\d\s/.:-]+", name) and not re.match(r"(?:a/?c|your)\b", name, re.IGNORECASE):
                counterparty = name
                break

    return ParsedSms(
        is_transaction=True,
        amount=amount,
        kind=kind,
        last_four=last_four_match.group(1) if last_four_match else None,
        counterparty=counterparty,
        reference=reference[:40] if reference else None,
    )
