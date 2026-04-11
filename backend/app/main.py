import asyncio
from contextlib import asynccontextmanager
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import Response
from sqlalchemy import text, select
from app.database import engine, Base, AsyncSessionLocal
from app.config import get_settings
from app.routers import auth, devices, player, events, contents, campaigns, schedules, settings as settings_router
from app.models import User
from app.auth import get_password_hash
from app.stale_device_broadcaster import run_stale_device_broadcaster
from app.sse_broadcast import run_redis_sse_bridge
from app.live_screen_stream import check_redis_live_screen


class RailwayHealthMiddleware:
    """Railway 프로브는 Host/경로가 달라도 /health 만 200이면 됨. CORS·라우터 전에 ASGI에서 바로 응답."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path") or ""
            method = scope.get("method", "GET")
            if path == "/health" or path.rstrip("/") == "/health":
                if method == "HEAD":
                    await send(
                        {
                            "type": "http.response.start",
                            "status": 200,
                            "headers": [(b"content-length", b"0")],
                        }
                    )
                    await send({"type": "http.response.body", "body": b"", "more_body": False})
                    return
                if method == "GET":
                    body = b'{"status":"ok"}'
                    await send(
                        {
                            "type": "http.response.start",
                            "status": 200,
                            "headers": [
                                (b"content-type", b"application/json; charset=utf-8"),
                                (b"content-length", str(len(body)).encode("ascii")),
                            ],
                        }
                    )
                    await send({"type": "http.response.body", "body": body, "more_body": False})
                    return
        await self.app(scope, receive, send)


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

            def add_device_live_screen_cols(sync_conn):
                for stmt in (
                    "ALTER TABLE devices ADD COLUMN live_screen_pending BOOLEAN DEFAULT 0",
                    "ALTER TABLE devices ADD COLUMN live_screen_ticket VARCHAR(64)",
                ):
                    try:
                        sync_conn.execute(text(stmt))
                    except Exception:
                        pass

            await conn.run_sync(add_device_live_screen_cols)

        if engine.dialect.name in ("mysql", "mariadb"):
            def add_device_live_screen_cols_mysql(sync_conn):
                for stmt in (
                    "ALTER TABLE devices ADD COLUMN live_screen_pending TINYINT(1) NOT NULL DEFAULT 0",
                    "ALTER TABLE devices ADD COLUMN live_screen_ticket VARCHAR(64) NULL",
                ):
                    try:
                        sync_conn.execute(text(stmt))
                    except Exception:
                        pass

            await conn.run_sync(add_device_live_screen_cols_mysql)

async def _log_live_screen_redis_status() -> None:
    """기동 직후 Redis 실시간 화면 설정 여부를 한 번 로그 (진단용)."""
    await asyncio.sleep(3.0)
    try:
        info = await check_redis_live_screen()
        print(f"[live_screen] redis: {info}")
    except Exception as e:
        print(f"[live_screen] redis status check failed: {e}")


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
    try:
        s = get_settings()
        os.makedirs(s.upload_dir, exist_ok=True)
        asyncio.create_task(_background_startup_db())
        asyncio.create_task(run_stale_device_broadcaster())
        asyncio.create_task(run_redis_sse_bridge())
        asyncio.create_task(_log_live_screen_redis_status())
    except Exception as e:
        print(f"lifespan prep failed (server still binds): {e}")
    yield
    try:
        await engine.dispose()
    except Exception as e:
        print(f"engine.dispose: {e}")


_extra_cors = [o.strip() for o in (get_settings().cors_origins_extra or "").split(",") if o.strip()]
app = FastAPI(
    title="PWA Digital Ad CMS API",
    lifespan=lifespan,
)


@app.middleware("http")
async def no_store_api_json(request: Request, call_next):
    """프록시·브라우저가 /api 응답을 캐시해 디바이스 상태가 안 바뀌는 것 방지."""
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "private, no-store, must-revalidate"
    return response


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/live-screen")
async def health_live_screen():
    """멀티 인스턴스 실시간 화면: Redis 연결 여부 확인용."""
    return await check_redis_live_screen()


@app.head("/health")
def health_head():
    return Response(status_code=200)


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

# 가장 마지막에 등록 = ASGI 최외곽. Railway 헬스체크(healthcheck.railway.app)가 스택을 타지 않고 통과
app.add_middleware(RailwayHealthMiddleware)

app.include_router(auth.router, prefix="/api")
app.include_router(devices.router, prefix="/api")
app.include_router(player.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(contents.router, prefix="/api")
app.include_router(campaigns.router, prefix="/api")
app.include_router(schedules.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")

settings = get_settings()
os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

PLAYER_DIR = os.path.join(os.path.dirname(__file__), "..", "player_dist")
PLAYER_INDEX = os.path.join(PLAYER_DIR, "index.html")
PLAYER_ASSETS = os.path.join(PLAYER_DIR, "assets")
SERVE_PLAYER = os.path.isfile(PLAYER_INDEX) and os.path.isdir(PLAYER_ASSETS)

CMS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cms_dist"))
CMS_INDEX = os.path.join(CMS_DIR, "index.html")
CMS_ASSETS = os.path.join(CMS_DIR, "assets")
SERVE_CMS = os.path.isfile(CMS_INDEX) and os.path.isdir(CMS_ASSETS)

# Railway 단일 서비스: 플레이어 PWA(navigateFallback)가 /admin 을 플레이어 index 로 덮어쓰는 것 방지 — CMS 라우트·마운트를 플레이어보다 먼저 등록
_CMS_HTML_HEADERS = {"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}

if SERVE_CMS:
    app.mount("/admin/assets", StaticFiles(directory=CMS_ASSETS), name="cms_assets")

    @app.get("/admin")
    @app.get("/admin/")
    def cms_admin_index():
        return FileResponse(CMS_INDEX, headers=_CMS_HTML_HEADERS)

    @app.get("/admin/{full_path:path}")
    def cms_admin_spa(full_path: str):
        if full_path.startswith("assets/"):
            raise HTTPException(status_code=404)
        safe_root = CMS_DIR + os.sep
        target = os.path.abspath(os.path.join(CMS_DIR, full_path))
        if not (target == CMS_DIR or target.startswith(safe_root)):
            raise HTTPException(status_code=404)
        if os.path.isfile(target):
            return FileResponse(target)
        return FileResponse(CMS_INDEX, headers=_CMS_HTML_HEADERS)

# 플레이어 정적 파일(같은 origin으로 서빙 시 외부 접속 시 IP 설정 불필요)
if SERVE_PLAYER:
    app.mount("/assets", StaticFiles(directory=PLAYER_ASSETS), name="player_assets")

    @app.get("/")
    def serve_player_index():
        """디스플레이(PWA) 루트 — 일부 프록시·라우터에서 `/{path}` 만으로 `/`가 안 잡히는 경우 대비."""
        return FileResponse(PLAYER_INDEX)


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


@app.get("/api/ready", include_in_schema=False)
def api_ready():
    """배포 진단: Docker에 player_dist/cms_dist가 들어왔는지(플레이어가 안 나올 때 확인)."""
    return {
        "ok": True,
        "player_spa": SERVE_PLAYER,
        "cms_spa": SERVE_CMS,
        "upload_dir": settings.upload_dir,
        "upload_dir_exists": os.path.isdir(settings.upload_dir),
    }


if SERVE_PLAYER:
    @app.get("/{full_path:path}")
    def serve_player_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("uploads/") or full_path.startswith("assets/"):
            raise HTTPException(status_code=404)
        if full_path.startswith("admin") or full_path.startswith("admin/"):
            raise HTTPException(status_code=404)
        if full_path in ("health", "docs", "openapi.json", "redoc", "setup-database"):
            raise HTTPException(status_code=404)
        # Vite PWA: dist 루트의 registerSW.js, sw.js, workbox-*.js, manifest.webmanifest 등
        # (위에서 index.html로 잘못 내려가면 SW/캐시가 깨짐)
        safe_root = os.path.abspath(PLAYER_DIR)
        target = os.path.abspath(os.path.join(safe_root, full_path))
        sep = os.sep
        if (target == safe_root or target.startswith(safe_root + sep)) and os.path.isfile(target):
            return FileResponse(target)
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
