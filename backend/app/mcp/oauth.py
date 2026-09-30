"""The OAuth 2.1 authorization server behind the MCP connector.

The MCP SDK supplies the protocol endpoints (metadata, /register, /authorize,
/token, /revoke) and their validation — PKCE, redirect URI matching, code
expiry, client authentication. This module is only the storage those handlers
call into, plus the hand-off to our own login page (app/mcp/login.py), since
"who is this user" is answered by Daybook's normal email + password.
"""

import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from jose import JWTError, jwt
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    RefreshToken,
    TokenError,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.security import hash_refresh_token as hash_token
from app.db.session import AsyncSessionLocal
from app.models.oauth import OAuthAuthorizationCode, OAuthClient, OAuthGrant
from app.models.user import User

settings = get_settings()

ISSUER_URL = f"{settings.public_url.rstrip('/')}/oauth"
RESOURCE_URL = f"{settings.public_url.rstrip('/')}/mcp"
LOGIN_URL = f"{ISSUER_URL}/login"

AUTHORIZATION_CODE_TTL = timedelta(minutes=5)
PENDING_REQUEST_TTL = timedelta(minutes=10)


def encode_pending_request(client_id: str, params: AuthorizationParams) -> str:
    """The /authorize parameters, carried through the login page as a signed,
    short-lived token rather than server-side state — the login form can't
    alter the redirect URI or PKCE challenge the SDK already validated."""
    payload = {
        "type": "oauth_pending",
        "client_id": client_id,
        "params": params.model_dump(mode="json"),
        "exp": datetime.now(UTC) + PENDING_REQUEST_TTL,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_pending_request(token: str) -> tuple[str, AuthorizationParams] | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("type") != "oauth_pending":
        return None
    return payload["client_id"], AuthorizationParams.model_validate(payload["params"])


async def issue_authorization_code(
    db: AsyncSession, client_id: str, params: AuthorizationParams, user_id: UUID
) -> str:
    code = secrets.token_urlsafe(32)
    db.add(
        OAuthAuthorizationCode(
            code_hash=hash_token(code),
            client_id=client_id,
            user_id=user_id,
            code_challenge=params.code_challenge,
            redirect_uri=str(params.redirect_uri),
            redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
            scopes=params.scopes or [],
            resource=params.resource,
            expires_at=datetime.now(UTC) + AUTHORIZATION_CODE_TTL,
        )
    )
    await db.commit()
    return code


async def revoke_user_grants(db: AsyncSession, user_id: UUID) -> None:
    """Disconnects every MCP client from this account. Doesn't commit — callers
    fold it into their own transaction (password reset, account disable)."""
    await db.execute(delete(OAuthGrant).where(OAuthGrant.user_id == user_id))


class DaybookOAuthProvider:
    """Implements the SDK's OAuthAuthorizationServerProvider protocol."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession] = AsyncSessionLocal) -> None:
        # Swappable so tests can point it at the test database.
        self.session_factory = session_factory

    # --- Clients -------------------------------------------------------------

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        async with self.session_factory() as db:
            row = await db.get(OAuthClient, client_id)
        return OAuthClientInformationFull.model_validate(row.info) if row else None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        async with self.session_factory() as db:
            db.add(OAuthClient(client_id=client_info.client_id, info=client_info.model_dump(mode="json")))
            await db.commit()

    # --- Authorization code --------------------------------------------------

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        # There's exactly one protected resource here, so a token is always
        # bound to it — and a request naming any other resource is refused
        # rather than silently issued a token that says otherwise.
        if params.resource is not None and params.resource.rstrip("/") != RESOURCE_URL:
            raise AuthorizeError(error="invalid_target", error_description="Unknown resource")
        params = params.model_copy(update={"resource": RESOURCE_URL})
        return f"{LOGIN_URL}?request={encode_pending_request(client.client_id, params)}"

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        async with self.session_factory() as db:
            row = await db.scalar(
                select(OAuthAuthorizationCode).where(
                    OAuthAuthorizationCode.code_hash == hash_token(authorization_code),
                    OAuthAuthorizationCode.client_id == client.client_id,
                )
            )
        if row is None:
            return None
        return AuthorizationCode(
            code=authorization_code,
            scopes=row.scopes,
            expires_at=row.expires_at.timestamp(),
            client_id=row.client_id,
            code_challenge=row.code_challenge,
            redirect_uri=row.redirect_uri,
            redirect_uri_provided_explicitly=row.redirect_uri_provided_explicitly,
            resource=row.resource,
            subject=str(row.user_id),
        )

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        async with self.session_factory() as db:
            # Deleting is what makes the code single-use: of two concurrent
            # exchanges, only the one whose DELETE actually removed the row wins.
            result = await db.execute(
                delete(OAuthAuthorizationCode).where(
                    OAuthAuthorizationCode.code_hash == hash_token(authorization_code.code)
                )
            )
            if result.rowcount != 1:
                raise TokenError(error="invalid_grant", error_description="Authorization code already used")
            user_id = UUID(authorization_code.subject)
            if not await _user_is_active(db, user_id):
                await db.commit()
                raise TokenError(error="invalid_grant", error_description="This account has been disabled")

            grant = OAuthGrant(
                client_id=client.client_id,
                user_id=user_id,
                scopes=authorization_code.scopes,
                resource=authorization_code.resource,
            )
            token = _rotate(grant)
            db.add(grant)
            await db.commit()
            return token

    # --- Refresh token -------------------------------------------------------

    async def load_refresh_token(self, client: OAuthClientInformationFull, refresh_token: str) -> RefreshToken | None:
        async with self.session_factory() as db:
            grant = await db.scalar(
                select(OAuthGrant).where(
                    OAuthGrant.refresh_token_hash == hash_token(refresh_token),
                    OAuthGrant.client_id == client.client_id,
                )
            )
        if grant is None:
            return None
        return RefreshToken(
            token=refresh_token,
            client_id=grant.client_id,
            scopes=grant.scopes,
            expires_at=int(grant.refresh_expires_at.timestamp()),
            resource=grant.resource,
            subject=str(grant.user_id),
        )

    async def exchange_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: RefreshToken, scopes: list[str]
    ) -> OAuthToken:
        async with self.session_factory() as db:
            grant = await db.scalar(
                select(OAuthGrant)
                .where(OAuthGrant.refresh_token_hash == hash_token(refresh_token.token))
                .with_for_update()
            )
            if grant is None:
                raise TokenError(error="invalid_grant", error_description="Refresh token already used")
            if not await _user_is_active(db, grant.user_id):
                await db.delete(grant)
                await db.commit()
                raise TokenError(error="invalid_grant", error_description="This account has been disabled")
            grant.scopes = scopes
            token = _rotate(grant)
            await db.commit()
            return token

    # --- Access token --------------------------------------------------------

    async def load_access_token(self, token: str) -> AccessToken | None:
        async with self.session_factory() as db:
            grant = await db.scalar(select(OAuthGrant).where(OAuthGrant.access_token_hash == hash_token(token)))
            if grant is None or grant.access_expires_at < datetime.now(UTC):
                return None
            # Checked on every request, not just at issue time: an account an
            # admin disables mid-session loses MCP access immediately.
            if not await _user_is_active(db, grant.user_id):
                return None
        return AccessToken(
            token=token,
            client_id=grant.client_id,
            scopes=grant.scopes,
            expires_at=int(grant.access_expires_at.timestamp()),
            resource=grant.resource,
            subject=str(grant.user_id),
        )

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        token_hash = hash_token(token.token)
        async with self.session_factory() as db:
            await db.execute(
                delete(OAuthGrant).where(
                    (OAuthGrant.access_token_hash == token_hash) | (OAuthGrant.refresh_token_hash == token_hash)
                )
            )
            await db.commit()


def _rotate(grant: OAuthGrant) -> OAuthToken:
    """Issues a fresh access/refresh pair onto the grant, replacing any old one."""
    access_token = secrets.token_urlsafe(32)
    refresh_token = secrets.token_urlsafe(48)
    now = datetime.now(UTC)
    access_ttl = timedelta(minutes=settings.mcp_access_token_expire_minutes)
    grant.access_token_hash = hash_token(access_token)
    grant.access_expires_at = now + access_ttl
    grant.refresh_token_hash = hash_token(refresh_token)
    grant.refresh_expires_at = now + timedelta(days=settings.refresh_token_expire_days)
    return OAuthToken(
        access_token=access_token,
        expires_in=int(access_ttl.total_seconds()),
        refresh_token=refresh_token,
        scope=" ".join(grant.scopes) or None,
    )


async def _user_is_active(db: AsyncSession, user_id: UUID) -> bool:
    user = await db.get(User, user_id)
    return user is not None and user.is_active

