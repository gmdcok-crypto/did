from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.deps import get_current_admin_user
from app.models import User
from app.registration_code import (
    get_registration_auth_code_for_admin,
    set_registration_auth_code_override,
)

router = APIRouter(prefix="/settings", tags=["settings"])


class DeviceRegistrationResponse(BaseModel):
    auth_code: str
    """현재 플레이어 등록에 사용되는 코드(환경 변수 또는 DB 저장값)."""

    uses_database: bool
    """True면 DB에 저장된 값이 우선 적용됨. False면 환경 변수 기본값만 사용."""


class DeviceRegistrationUpdate(BaseModel):
    auth_code: str = ""
    """새 인증코드. 빈 문자열이면 DB 저장을 지우고 환경 변수 값을 씀."""


@router.get("/device-registration", response_model=DeviceRegistrationResponse)
async def get_device_registration(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    effective, has_db = await get_registration_auth_code_for_admin(db)
    return DeviceRegistrationResponse(auth_code=effective, uses_database=has_db)


@router.put("/device-registration", response_model=DeviceRegistrationResponse)
async def put_device_registration(
    data: DeviceRegistrationUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    await set_registration_auth_code_override(db, data.auth_code)
    await db.commit()
    effective, has_db = await get_registration_auth_code_for_admin(db)
    return DeviceRegistrationResponse(auth_code=effective, uses_database=has_db)
