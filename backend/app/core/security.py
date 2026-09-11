import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()
_hasher = PasswordHasher()


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _hasher.verify(hashed, plain)
    except VerifyMismatchError:
        return False


def create_access_token(user_id: UUID) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user_id), "type": "access", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> UUID | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("type") != "access":
        return None
    sub = payload.get("sub")
    return UUID(sub) if sub else None


def generate_refresh_token() -> str:
    """Opaque random token — the value the client holds. Only its hash is stored."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    """Deterministic hash for lookup — refresh tokens are high-entropy, so SHA-256 is fine
    (unlike passwords, there is nothing to slow down against offline guessing)."""
    return hashlib.sha256(token.encode()).hexdigest()


def refresh_token_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)


TokenType = Literal["access", "refresh"]
