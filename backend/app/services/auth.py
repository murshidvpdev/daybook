from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    refresh_token_expiry,
    verify_password,
)
from app.models.user import User, UserSession
from app.schemas.auth import RegisterRequest


class AuthError(Exception):
    pass


async def register_user(db: AsyncSession, data: RegisterRequest) -> User:
    existing = await db.scalar(select(User).where(User.email == data.email))
    if existing is not None:
        raise AuthError("An account with this email already exists")
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        display_name=data.display_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    user = await db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(password, user.hashed_password):
        raise AuthError("Incorrect email or password")
    return user


async def issue_tokens(db: AsyncSession, user: User, user_agent: str | None) -> tuple[str, str]:
    access_token = create_access_token(user.id)
    refresh_token = generate_refresh_token()
    session = UserSession(
        user_id=user.id,
        refresh_token_hash=hash_refresh_token(refresh_token),
        expires_at=refresh_token_expiry(),
        created_at=datetime.now(UTC),
        user_agent=user_agent,
    )
    db.add(session)
    await db.commit()
    return access_token, refresh_token


async def rotate_refresh_token(db: AsyncSession, raw_refresh_token: str) -> tuple[str, str]:
    """Validates a refresh token, revokes it, and issues a fresh pair.
    Rotation means a stolen-and-reused token is detectable: reuse after rotation
    means the session it belonged to should already be dead."""
    token_hash = hash_refresh_token(raw_refresh_token)
    session = await db.scalar(select(UserSession).where(UserSession.refresh_token_hash == token_hash))
    if session is None or session.revoked_at is not None:
        raise AuthError("Invalid refresh token")
    if session.expires_at < datetime.now(UTC):
        raise AuthError("Refresh token expired")

    session.revoked_at = datetime.now(UTC)
    user = await db.get(User, session.user_id)
    if user is None:
        raise AuthError("Invalid refresh token")

    await db.commit()
    return await issue_tokens(db, user, session.user_agent)


async def revoke_refresh_token(db: AsyncSession, raw_refresh_token: str) -> None:
    token_hash = hash_refresh_token(raw_refresh_token)
    session = await db.scalar(select(UserSession).where(UserSession.refresh_token_hash == token_hash))
    if session is not None and session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)
        await db.commit()
