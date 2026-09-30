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

    # A separate secret from jwt_secret, deliberately — an admin token and a
    # regular user token must never be valid against each other's decoder,
    # even if a claim like "is_admin" were somehow forged or confused.
    admin_jwt_secret: str = "dev-only-secret-3f8a2c9d1b7e4f6a0c5d8b3e7f2a1c9d"
    admin_access_token_expire_minutes: int = 120

    cors_origins: list[str] = ["http://localhost:5173"]

    # The origin Claude (or any MCP client) reaches this API through — in
    # production the Cloudflare Pages domain, not EC2's own hostname. The MCP
    # connector's OAuth issuer, endpoint URLs, and resource identifier are all
    # built from it, so it has to be the URL the outside world actually uses.
    public_url: str = "http://localhost:8000"
    mcp_access_token_expire_minutes: int = 60

    # Deliberately overridable per environment: production should stay tight
    # (these are the numbers a real single user ever needs), while local dev
    # running a burst of E2E tests against one long-lived server process from
    # one IP needs far more headroom — that's normal test traffic, not abuse.
    register_rate_limit: str = "5/minute"
    login_rate_limit: str = "10/minute"
    refresh_rate_limit: str = "30/minute"
    admin_login_rate_limit: str = "10/minute"

    @model_validator(mode="after")
    def _refuse_weak_secret_outside_development(self) -> "Settings":
        """Fails at startup, not at the first login someone else attempts —
        a known or short JWT secret in a publicly reachable deployment lets
        anyone forge an access token for any user_id."""
        if self.environment != "development":
            for name, value in (("JWT_SECRET", self.jwt_secret), ("ADMIN_JWT_SECRET", self.admin_jwt_secret)):
                if value in _KNOWN_DEV_SECRETS or len(value) < 32:
                    raise ValueError(
                        f"{name} must be a long random value outside development — "
                        "generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
                    )
            if not self.public_url.startswith("https://"):
                # OAuth clients refuse a non-HTTPS issuer, so this would only
                # surface as a connector that silently fails to authorize.
                raise ValueError("PUBLIC_URL must be the public https:// origin outside development")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
