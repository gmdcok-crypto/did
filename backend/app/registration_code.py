"""디바이스 등록용 인증코드: DB에 있으면 우선, 없거나 비어 있으면 환경 변수 기본값."""

from __future__ import annotations

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.app_setting import AppSetting, REGISTRATION_AUTH_KEY


async def get_effective_registration_auth_code(db: AsyncSession) -> str:
    r = await db.execute(select(AppSetting).where(AppSetting.key == REGISTRATION_AUTH_KEY))
    row = r.scalar_one_or_none()
    if row and (row.value or "").strip():
        return (row.value or "").strip()
    return (get_settings().registration_auth_code or "").strip()


async def set_registration_auth_code_override(db: AsyncSession, code: str | None) -> None:
    """빈 문자열이면 DB 오버라이드 제거(환경 변수 값 사용)."""
    c = (code or "").strip()
    if not c:
        await db.execute(delete(AppSetting).where(AppSetting.key == REGISTRATION_AUTH_KEY))
        return
    r = await db.execute(select(AppSetting).where(AppSetting.key == REGISTRATION_AUTH_KEY))
    row = r.scalar_one_or_none()
    if row:
        row.value = c
    else:
        db.add(AppSetting(key=REGISTRATION_AUTH_KEY, value=c))


async def get_registration_auth_code_for_admin(db: AsyncSession) -> tuple[str, bool]:
    """(현재 유효한 코드, DB에 오버라이드가 있는지)."""
    r = await db.execute(select(AppSetting).where(AppSetting.key == REGISTRATION_AUTH_KEY))
    row = r.scalar_one_or_none()
    has_db = bool(row and (row.value or "").strip())
    effective = await get_effective_registration_auth_code(db)
    return effective, has_db
