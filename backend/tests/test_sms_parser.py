from decimal import Decimal

import pytest

from app.services.sms_parser import parse_bank_sms

CASES = [
    (
        "Sent Rs.450.00 From HDFC Bank A/C *1234 To SWIGGY On 21/10/26 Ref 429112345678 Not You? Call 18002586161",
        ("450.00", "expense", "1234", "SWIGGY", "429112345678"),
    ),
    (
        ("Dear UPI user A/C X1234 debited by 450.0 on date 21Oct26 trf to SWIGGY Refno 429112345678. "
        "If not u? call 1800111109. -SBI"),
        ("450.0", "expense", "1234", "SWIGGY", "429112345678"),
    ),
    (
        ("ICICI Bank Acct XX234 debited for Rs 450.00 on 21-Oct-26; SWIGGY credited. UPI:429112345678. "
        "Call 18002662 for dispute."),
        ("450.00", "expense", "234", "SWIGGY", "429112345678"),
    ),
    (
        ("INR 450.00 debited A/c no. XX1234 21-10-26 12:01:02 UPI/P2M/429112345678/SWIGGY Not you? "
        "SMS BLOCKUPI Cust ID to 919951860002 Axis Bank"),
        ("450.00", "expense", "1234", "SWIGGY", "429112345678"),
    ),
    (
        "Dear Customer, Rs.5000.00 credited to A/c XX1234 on 21-10-26 by VPA arjun@ybl (UPI Ref No 429112345679). -Kotak",
        ("5000.00", "income", "1234", "arjun@ybl", "429112345679"),
    ),
    (
        "Rs.2000.00 spent on HDFC Bank Card x5678 at AMAZON on 2026-10-21:10:01:02. Not you? Call 18002586161",
        ("2000.00", "expense", "5678", "AMAZON", None),
    ),
    (
        "INR 2,000.00 spent using ICICI Bank Card XX5678 on 21-Oct-26 on AMAZON. Avl Limit: INR 98,000.00.",
        ("2000.00", "expense", "5678", "AMAZON", None),
    ),
]


# Real messages from the banks in use (amounts and references as received).
CASES += [
    (
        ("Spent INR 20\nusing Axis Bank Credit Card no. XX3973 on 20-10-26 16:37:34 IST at\nRamachandra.\n"
        "Avl limit: INR 81616.93. Not you? SMS BLOCK 3973 to +919951860002"),
        ("20", "expense", "3973", "Ramachandra", None),
    ),
    (
        ("Payment of Rs 6,588.54 has been received on your ICICI Bank Credit Card XX7005 through "
        "Bharat Bill Payment System on 16-OCT-26."),
        ("6588.54", "income", "7005", None, None),
    ),
    (
        ("ICICI Bank Credit Card XX6007 debited for INR 100.00 on 17-Oct-26 for UPI-629027045628-HULE CON. "
        "To dispute call 18001080/SMS BLOCK 6007 to 9215676766"),
        ("100.00", "expense", "6007", "HULE CON", "629027045628"),
    ),
    (
        ("Debited Rs 1000.00 from a/c X7762 on 19Oct26 15:33 via UPI to SHAHIDA  K. Ref 616374398760."
        "Bal Rs 15141.17. Not you?Call 18004251199 -Federal Bank"),
        ("1000.00", "expense", "7762", "SHAHIDA K", "616374398760"),
    ),
    (
        ("HSBC Credit Card xx9832 used at REL*DREAMPLUG PAYTECH for INR 31050.00 on 10/10/26. "
        "Avl limit INR 45084.06; due INR 102915.94. Call +914065118002 to report fraud."),
        ("31050.00", "expense", "9832", "REL*DREAMPLUG PAYTECH", None),
    ),
]


@pytest.mark.parametrize(("text", "expected"), CASES)
def test_reads_common_bank_formats(text: str, expected: tuple) -> None:
    parsed = parse_bank_sms(text)
    amount, kind, last_four, counterparty, reference = expected
    assert parsed.is_transaction
    assert parsed.amount == Decimal(amount)
    assert parsed.kind == kind
    assert parsed.last_four == last_four
    assert parsed.counterparty == counterparty
    assert parsed.reference == reference


@pytest.mark.parametrize(
    "text",
    [
        "Your OTP for transaction of Rs 450 is 123456. Do not share.",
        "Rs 1,200 will be debited from your A/c XX1234 on 25-10-26 towards SIP mandate.",
        "Your payment of Rs 450 to SWIGGY has failed. Amount, if debited, will be refunded.",
        "Hi! Get 20% cashback on your next order.",
        ("Use 935741 as your OTP to register your device with HSBC Credit Card XX9832. "
        "This OTP is usable once & valid for 5 mins."),
        "Total of Rs 65,327.80 or minimum of Rs 3,270.00 is due by 21-OCT-26 on ICICI Bank Credit Card XX6007.",
    ],
)
def test_ignores_messages_that_are_not_completed_transactions(text: str) -> None:
    assert parse_bank_sms(text).is_transaction is False
