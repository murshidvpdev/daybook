from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin_id
from app.core.config import get_settings
from app.core.limiter import limiter
from app.core.security import create_admin_access_token
from app.db.session import get_db
from app.schemas.admin import (
    AdminAccessTokenResponse,
    AdminLoginRequest,
    AdminStatsOut,
    ResetPasswordRequest,
    SetActiveRequest,
    UserDetailOut,
    UserListItemOut,
)
from app.services import admin as service

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()


@router.post("/auth/login", response_model=AdminAccessTokenResponse)
@limiter.limit(lambda: settings.admin_login_rate_limit)
async def admin_login(
    request: Request, payload: AdminLoginRequest, db: AsyncSession = Depends(get_db)
) -> AdminAccessTokenResponse:
    try:
        admin = await service.authenticate_admin(db, payload.email, payload.password)
    except service.AdminAuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    return AdminAccessTokenResponse(access_token=create_admin_access_token(admin.id))


@router.get("/stats", response_model=AdminStatsOut)
async def stats(
    db: AsyncSession = Depends(get_db), _admin_id: UUID = Depends(get_current_admin_id)
) -> dict:
    return await service.get_stats(db)


@router.get("/users", response_model=list[UserListItemOut])
async def list_users(
    db: AsyncSession = Depends(get_db), _admin_id: UUID = Depends(get_current_admin_id)
) -> list[dict]:
    return await service.list_users(db)


@router.get("/users/{user_id}", response_model=UserDetailOut)
async def user_detail(
    user_id: UUID, db: AsyncSession = Depends(get_db), _admin_id: UUID = Depends(get_current_admin_id)
) -> dict:
    try:
        return await service.get_user_detail(db, user_id)
    except service.AdminUserNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    user_id: UUID,
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    _admin_id: UUID = Depends(get_current_admin_id),
) -> None:
    try:
        await service.reset_user_password(db, user_id, payload.new_password)
    except service.AdminUserNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/users/{user_id}/active", status_code=status.HTTP_204_NO_CONTENT)
async def set_active(
    user_id: UUID,
    payload: SetActiveRequest,
    db: AsyncSession = Depends(get_db),
    _admin_id: UUID = Depends(get_current_admin_id),
) -> None:
    try:
        await service.set_user_active(db, user_id, payload.is_active)
    except service.AdminUserNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID, db: AsyncSession = Depends(get_db), _admin_id: UUID = Depends(get_current_admin_id)
) -> None:
    try:
        await service.delete_user(db, user_id)
    except service.AdminUserNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
