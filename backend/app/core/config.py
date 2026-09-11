from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_KNOWN_DEV_SECRETS = {"dev-secret-change-me", "dev-only-secret-3f8a2c9d1b7e4f6a0c5d8b3e7f2a1c9d"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Daybook API"
    environment: str = "development"

    database_url: str = "postgresql+asyncpg://daybook:daybook@localhost:5432/daybook"

    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    cors_origins: list[str] = ["http://localhost:5173"]

    @model_validator(mode="after")
    def _refuse_weak_secret_outside_development(self) -> "Settings":
        """Fails at startup, not at the first login someone else attempts —
        a known or short JWT secret in a publicly reachable deployment lets
        anyone forge an access token for any user_id."""
        if self.environment != "development" and (
            self.jwt_secret in _KNOWN_DEV_SECRETS or len(self.jwt_secret) < 32
        ):
            raise ValueError(
                "JWT_SECRET must be a long random value outside development — "
                "generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
