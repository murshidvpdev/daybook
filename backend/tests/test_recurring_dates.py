from datetime import date

from app.services.recurring import advance_one_month, clamp_day_to_month, compute_next_due_date


def test_clamp_day_handles_short_months():
    assert clamp_day_to_month(2026, 2, 31) == 28  # 2026 is not a leap year
    assert clamp_day_to_month(2024, 2, 31) == 29  # 2024 is
    assert clamp_day_to_month(2026, 4, 31) == 30
    assert clamp_day_to_month(2026, 1, 15) == 15


def test_compute_next_due_date_same_month_if_not_passed():
    assert compute_next_due_date(20, from_date=date(2026, 9, 11)) == date(2026, 9, 20)


def test_compute_next_due_date_rolls_to_next_month_if_passed():
    assert compute_next_due_date(5, from_date=date(2026, 9, 11)) == date(2026, 10, 5)


def test_compute_next_due_date_on_due_day_itself_is_today():
    assert compute_next_due_date(11, from_date=date(2026, 9, 11)) == date(2026, 9, 11)


def test_compute_next_due_date_rolls_december_into_january():
    assert compute_next_due_date(5, from_date=date(2026, 12, 20)) == date(2027, 1, 5)


def test_compute_next_due_date_rejects_invalid_day():
    import pytest

    with pytest.raises(ValueError):
        compute_next_due_date(32)
    with pytest.raises(ValueError):
        compute_next_due_date(0)


def test_advance_one_month_clamps_into_february():
    assert advance_one_month(31, date(2026, 1, 31)) == date(2026, 2, 28)
