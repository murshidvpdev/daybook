"""OAuth 2.1 authorization-server state for the MCP connector (see app/mcp/).

Like UserSession, only hashes of codes and tokens are stored — never the raw
values — so a database read alone can't be used to act as a connected client.
"""

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class OAuthClient(Base, TimestampMixin):
    """A client registered via dynamic client registration (RFC 7591) —
    e.g. one Claude installation adding the Daybook connector."""

    __tablename__ = "oauth_clients"

    client_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # The SDK's OAuthClientInformationFull, as JSON — redirect URIs, client
    # name, auth method, and the client secret for confidential clients.
    info: Mapped[dict] = mapped_column(JSON, nullable=False)


class OAuthAuthorizationCode(Base, UUIDPKMixin):
    """Single-use, minutes-long code issued after the user logs in on the
    consent page; exchanged (with its PKCE verifier) for a grant."""

    __tablename__ = "oauth_authorization_codes"

    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("oauth_clients.client_id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_challenge: Mapped[str] = mapped_column(String(128))
    redirect_uri: Mapped[str] = mapped_column(Text)
    redirect_uri_provided_explicitly: Mapped[bool] = mapped_column(Boolean)
    scopes: Mapped[list[str]] = mapped_column(JSON, default=list)
    resource: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class OAuthGrant(Base, UUIDPKMixin, TimestampMixin):
    """One row per (user, connected client) authorization. Holds the current
    access/refresh token pair; refreshing rotates both in place, and revoking
    (or disabling the user) deletes the row, which kills both at once."""

    __tablename__ = "oauth_grants"

    client_id: Mapped[str] = mapped_column(ForeignKey("oauth_clients.client_id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scopes: Mapped[list[str]] = mapped_column(JSON, default=list)
    resource: Mapped[str | None] = mapped_column(Text, nullable=True)
    access_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    refresh_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
