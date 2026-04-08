import asyncio
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
    import app.models  # noqa: F401 — Base.metadata 에 모든 테이블 등록

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        def _log_tables(sync_conn):
            from sqlalchemy import inspect

            names = inspect(sync_conn).get_table_names()
            print(f"create_all done; tables in DB: {names}")

        await conn.run_sync(_log_tables)
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


async def init_db_with_retry(max_attempts: int = 15, delay_seconds: float = 2.0) -> bool:
    """MySQL/MariaDB 기동 지연·네트워크 대비해 create_all 재시도. 성공 시 True."""
    last_err: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            await init_db()
            if attempt > 1:
                print(f"init_db succeeded on attempt {attempt}/{max_attempts}")
            return True
        except Exception as e:
            last_err = e
            print(f"init_db attempt {attempt}/{max_attempts} failed: {e}")
            if attempt < max_attempts:
                await asyncio.sleep(delay_seconds)
    print(f"init_db gave up after {max_attempts} attempts (check DATABASE_URL / MySQL): {last_err}")
    return False


async def _background_startup_db() -> None:
    """Railway 헬스체크: lifespan 에서 await 하면 포트 오픈이 늦어짐 → 백그라운드에서 create_all·시드."""
    ok = await init_db_with_retry()
    if not ok:
        return
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    os.makedirs(settings.upload_dir, exist_ok=True)
    asyncio.create_task(_background_startup_db())
    yield
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

# CMS 정적 파일(배포 시 cms_dist 빌드 → /admin)
CMS_DIR = os.path.join(os.path.dirname(__file__), "..", "cms_dist")
CMS_INDEX = os.path.join(CMS_DIR, "index.html")
CMS_ASSETS = os.path.join(CMS_DIR, "assets")
SERVE_CMS = os.path.isfile(CMS_INDEX) and os.path.isdir(CMS_ASSETS)

if SERVE_CMS:
    app.mount(
        "/admin",
        StaticFiles(directory=CMS_DIR, html=True),
        name="cms_static",
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/db-status", include_in_schema=False)
async def db_status():
    """현재 연결된 DB 이름·테이블 목록(진단용). MySQL·MariaDB 동일."""
    try:
        async with engine.connect() as conn:
            db_name = (await conn.execute(text("SELECT DATABASE()"))).scalar_one_or_none()
            r = await conn.execute(
                text(
                    "SELECT TABLE_NAME FROM information_schema.TABLES "
                    "WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
                )
            )
            tables = [row[0] for row in r.fetchall()]
            user_count = None
            if "users" in tables:
                user_count = (await conn.execute(text("SELECT COUNT(*) FROM users"))).scalar_one()
            return {
                "ok": True,
                "dialect": engine.dialect.name,
                "database": db_name,
                "tables": tables,
                "table_count": len(tables),
                "users_row_count": user_count,
            }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "dialect": getattr(engine.dialect, "name", "?"),
        }


@app.get("/setup-database", include_in_schema=False)
async def setup_database_public():
    """DB 테이블·기본 계정이 없을 때 초기화. URL이 짧아 브라우저에서 호출하기 쉬움."""
    from app.routers.auth import run_ensure_seed

    return await run_ensure_seed()


if SERVE_PLAYER:
    @app.get("/{full_path:path}")
    def serve_player_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("uploads/") or full_path.startswith("assets/"):
            raise HTTPException(status_code=404)
        if full_path.startswith("admin") or full_path.startswith("admin/"):
            raise HTTPException(status_code=404)
        if full_path in ("health", "docs", "openapi.json", "redoc", "setup-database"):
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
