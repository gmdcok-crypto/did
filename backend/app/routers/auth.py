from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from typing import Optional
from app.database import get_db
from app.models import User
from app.auth import get_password_hash, create_access_token, verify_password
from app.deps import get_current_user
from app.default_admin import DEFAULT_ADMIN_LOGIN, DEFAULT_ADMIN_PASSWORD

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str  # 아이디(로그인 ID). 컬럼명은 email 유지
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: Optional[str] = None  # 로그인 직후 CMS에서 사용자 표시용


class MeResponse(BaseModel):
    email: str
    role: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=1)


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    login_id = (data.email or "").strip()
    result = await db.execute(select(User).where(User.email == login_id))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")
    token = create_access_token(data={"sub": user.email})
    return TokenResponse(access_token=token, email=user.email)


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)):
    return MeResponse(email=user.email, role=user.role)


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않습니다.")
    new_pw = (data.new_password or "").strip()
    if len(new_pw) < 4:
        raise HTTPException(status_code=400, detail="새 비밀번호는 4자 이상이어야 합니다.")
    if verify_password(new_pw, user.hashed_password):
        raise HTTPException(status_code=400, detail="새 비밀번호가 현재 비밀번호와 같습니다.")
    user.hashed_password = get_password_hash(new_pw)
    await db.flush()
    return {"ok": True, "message": "비밀번호가 변경되었습니다."}


async def run_ensure_seed() -> dict:
    """create_all + 기본 그룹·관리자 시드. 라우터·main 양쪽에서 호출."""
    import app.models  # noqa: F401 — 모든 모델을 metadata에 등록

    from app.database import engine, AsyncSessionLocal, Base
    from app.models import DeviceGroup

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    created_admin = False
    created_group = False
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(DeviceGroup).where(DeviceGroup.name == "기본"))
        if r.scalar_one_or_none() is None:
            db.add(DeviceGroup(name="기본", orientation="landscape"))
            await db.commit()
            created_group = True

        r = await db.execute(select(User).where(User.email == DEFAULT_ADMIN_LOGIN))
        admin_user = r.scalar_one_or_none()
        if admin_user is None:
            db.add(
                User(
                    email=DEFAULT_ADMIN_LOGIN,
                    hashed_password=get_password_hash(DEFAULT_ADMIN_PASSWORD),
                    role="admin",
                )
            )
            await db.commit()
            created_admin = True
            admin_user = (
                await db.execute(select(User).where(User.email == DEFAULT_ADMIN_LOGIN))
            ).scalar_one_or_none()

        # 기본 비밀번호가 그대로일 때만 로그인 화면에 안내 표시
        show_default_login_hint = bool(
            admin_user
            and verify_password(DEFAULT_ADMIN_PASSWORD, admin_user.hashed_password)
        )

    return {
        "ok": True,
        "created": created_admin or created_group,
        "created_admin": created_admin,
        "created_group": created_group,
        "show_default_login_hint": show_default_login_hint,
    }


@router.get("/ensure-seed")
async def ensure_seed():
    """CMS 로그인 화면에서 호출 (인증 불필요)."""
    return await run_ensure_seed()
