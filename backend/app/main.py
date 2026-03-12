from contextlib import asynccontextmanager
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text, select
from app.database import engine, Base, AsyncSessionLocal
from app.config import get_settings
from app.routers import auth, devices, player, events, contents, campaigns, schedules
from app.models import User
from app.auth import get_password_hash


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # SQLite 기존 DB에만: registered_at 컬럼 추가 (MariaDB/PostgreSQL은 create_all에 이미 포함)
        if engine.dialect.name == "sqlite":
            def add_registered_at(sync_conn):
                try:
                    sync_conn.execute(text("ALTER TABLE devices ADD COLUMN registered_at DATETIME"))
                except Exception:
                    pass
                try:
                    sync_conn.execute(text(
                        "UPDATE devices SET registered_at = created_at WHERE registered_at IS NULL"
                    ))
                except Exception:
                    pass
                try:
                    sync_conn.execute(text(
                        "UPDATE devices SET registered_at = NULL WHERE name = 'Player' AND (location = '' OR location IS NULL)"
                    ))
                except Exception:
                    pass
            await conn.run_sync(add_registered_at)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    settings = get_settings()
    os.makedirs(settings.upload_dir, exist_ok=True)
    # 관리자 계정이 하나도 없으면 기본 계정 생성 (로그인 가능하도록)
    try:
        async with AsyncSessionLocal() as db:
            r = await db.execute(select(User).limit(1))
            first_user = r.scalars().first()
            if first_user is None:
                u = User(
                    email="admin@example.com",
                    hashed_password=get_password_hash("admin123"),
                    role="admin",
                )
                db.add(u)
                await db.commit()
    except Exception:
        pass  # 테이블 없거나 이미 있으면 무시
    yield
    # 재시작/종료 시 DB 연결 정리 (aiomysql Event loop is closed 방지)
    await engine.dispose()


_extra_cors = [o.strip() for o in (get_settings().cors_origins_extra or "").split(",") if o.strip()]
app = FastAPI(
    title="PWA Digital Ad CMS API",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "http://127.0.0.1:5177",
        "https://localhost:5173",
        "https://localhost:5174",
        "https://localhost:5175",
        "https://localhost:5176",
        "https://localhost:5177",
        "https://127.0.0.1:5173",
        "https://127.0.0.1:5174",
        "https://127.0.0.1:5175",
        "https://127.0.0.1:5176",
        "https://127.0.0.1:5177",
        "https://localhost",
        "https://127.0.0.1",
        *_extra_cors,
    ],
    allow_origin_regex=r"^https?://(192\.168\.\d+\.\d+|localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(devices.router, prefix="/api")
app.include_router(player.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(contents.router, prefix="/api")
app.include_router(campaigns.router, prefix="/api")
app.include_router(schedules.router, prefix="/api")

settings = get_settings()
os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {
        "service": "PWA Digital Ad CMS API",
        "health": "/health",
        "docs": "/docs",
        "api": "/api",
    }
