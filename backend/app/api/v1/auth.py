from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import AccessTokenResponse, LoginRequest, RegisterRequest, UserOut
from app.services.auth import (
    AuthError,
    authenticate_user,
    issue_tokens,
    register_user,
    revoke_refresh_token,
    rotate_refresh_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

REFRESH_COOKIE = "daybook_refresh"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=settings.environment != "development",
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        path="/api/v1/auth",
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> User:
    try:
        return await register_user(db, payload)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/login", response_model=AccessTokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request, payload: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)
) -> AccessTokenResponse:
    try:
        user = await authenticate_user(db, payload.email, payload.password)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    access_token, refresh_token = await issue_tokens(db, user, request.headers.get("user-agent"))
    _set_refresh_cookie(response, refresh_token)
    return AccessTokenResponse(access_token=access_token)


@router.post("/refresh", response_model=AccessTokenResponse)
@limiter.limit("30/minute")
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_cookie: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
) -> AccessTokenResponse:
    if refresh_cookie is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    try:
        access_token, new_refresh_token = await rotate_refresh_token(db, refresh_cookie)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    _set_refresh_cookie(response, new_refresh_token)
    return AccessTokenResponse(access_token=access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_cookie: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
) -> None:
    if refresh_cookie is not None:
        await revoke_refresh_token(db, refresh_cookie)
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> User:
    return user
