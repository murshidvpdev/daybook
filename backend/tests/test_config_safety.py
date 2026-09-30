import pytest

from app.core.config import Settings


def test_dev_secret_is_fine_in_development() -> None:
    Settings(environment="development", jwt_secret="dev-secret-change-me")


def test_known_dev_secret_rejected_outside_development() -> None:
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(environment="production", jwt_secret="dev-secret-change-me")


def test_short_secret_rejected_outside_development() -> None:
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(environment="production", jwt_secret="too-short")


def test_long_random_secret_accepted_in_production() -> None:
    Settings(
        environment="production",
        jwt_secret="a" * 64,
        admin_jwt_secret="b" * 64,
        public_url="https://daybook.example.com",
    )


def test_non_https_public_url_rejected_outside_development() -> None:
    with pytest.raises(ValueError, match="PUBLIC_URL"):
        Settings(environment="production", jwt_secret="a" * 64, admin_jwt_secret="b" * 64)


def test_known_dev_admin_secret_rejected_outside_development() -> None:
    with pytest.raises(ValueError, match="ADMIN_JWT_SECRET"):
        Settings(environment="production", jwt_secret="a" * 64, admin_jwt_secret="dev-secret-change-me")


def test_short_admin_secret_rejected_outside_development() -> None:
    with pytest.raises(ValueError, match="ADMIN_JWT_SECRET"):
        Settings(environment="production", jwt_secret="a" * 64, admin_jwt_secret="too-short")
