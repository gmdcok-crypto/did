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


@router.get("/ensure-seed")
async def ensure_seed(db: AsyncSession = Depends(get_db)):
    """관리자 계정이 없으면 생성. 로그인 전에 호출해도 됨 (인증 불필요)."""
    from app.auth import get_password_hash
    result = await db.execute(select(User).where(User.email == "admin@example.com"))
    if result.scalar_one_or_none() is not None:
        return {"ok": True, "created": False}
    u = User(
        email="admin@example.com",
        hashed_password=get_password_hash("admin123"),
        role="admin",
    )
    db.add(u)
    await db.commit()
    return {"ok": True, "created": True}
