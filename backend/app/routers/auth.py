from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import User
from app.auth import get_password_hash, create_access_token
from app.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: Optional[str] = None  # 로그인 직후 CMS에서 사용자 표시용


class MeResponse(BaseModel):
    email: str
    role: str


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    from app.auth import verify_password
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(data={"sub": user.email})
    return TokenResponse(access_token=token, email=user.email)


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)):
    return MeResponse(email=user.email, role=user.role)


async def run_ensure_seed() -> dict:
    """create_all + 기본 그룹·관리자 시드. 라우터·main 양쪽에서 호출."""
    import app.models  # noqa: F401 — 모든 모델을 metadata에 등록

    from app.auth import get_password_hash
    from app.database import engine, AsyncSessionLocal, Base
    from app.models import DeviceGroup

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    created_admin = False
    created_group = False
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(DeviceGroup).where(DeviceGroup.name == "기본"))
        if r.scalar_one_or_none() is None:
            db.add(DeviceGroup(name="기본"))
            await db.commit()
            created_group = True

        r = await db.execute(select(User).where(User.email == "admin@example.com"))
        if r.scalar_one_or_none() is not None:
            return {
                "ok": True,
                "created": False,
                "created_admin": False,
                "created_group": created_group,
            }
        db.add(
            User(
                email="admin@example.com",
                hashed_password=get_password_hash("admin123"),
                role="admin",
            )
        )
        await db.commit()
        created_admin = True

    return {
        "ok": True,
        "created": True,
        "created_admin": created_admin,
        "created_group": created_group,
    }


@router.get("/ensure-seed")
async def ensure_seed():
    """CMS 로그인 화면에서 호출 (인증 불필요)."""
    return await run_ensure_seed()
