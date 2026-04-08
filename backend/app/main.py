from contextlib import asynccontextmanager
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import HTTPException
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
    # DB가 아직 없거나 URL이 틀려도 프로세스는 뜨게 함(Railway 헬스체크·로그 확인용)
    try:
        await init_db()
    except Exception as e:
        print(f"init_db failed (check DATABASE_URL / MariaDB): {e}")
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
                print("Created default admin: admin@example.com / admin123")
    except Exception as e:
        print(f"Startup seed failed (run manually if needed): cd backend && python -m app.init_db — {e}")
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
    allow_origin_regex=r"^https?://(192\.168\.\d+\.\d+|localhost|127\.0\.0\.1)(:\d+)?$|^https://[a-zA-Z0-9-]+\.up\.railway\.app$",
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

# 플레이어 정적 파일(같은 origin으로 서빙 시 외부 접속 시 IP 설정 불필요)
PLAYER_DIR = os.path.join(os.path.dirname(__file__), "..", "player_dist")
PLAYER_INDEX = os.path.join(PLAYER_DIR, "index.html")
PLAYER_ASSETS = os.path.join(PLAYER_DIR, "assets")
SERVE_PLAYER = os.path.isfile(PLAYER_INDEX) and os.path.isdir(PLAYER_ASSETS)

if SERVE_PLAYER:
    app.mount("/assets", StaticFiles(directory=PLAYER_ASSETS), name="player_assets")

@app.get("/health")
def health():
    return {"status": "ok"}


if SERVE_PLAYER:
    @app.get("/{full_path:path}")
    def serve_player_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("uploads/") or full_path.startswith("assets/"):
            raise HTTPException(status_code=404)
        if full_path in ("health", "docs", "openapi.json", "redoc"):
            raise HTTPException(status_code=404)
        return FileResponse(PLAYER_INDEX)
else:
    @app.get("/")
    def root():
        return {
            "service": "PWA Digital Ad CMS API",
            "health": "/health",
            "docs": "/docs",
            "api": "/api",
        }
