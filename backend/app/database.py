import threading
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

_engine = None
_session_factory = None
_lock = threading.Lock()


def get_engine():
    """첫 API/백그라운드 DB 접근까지 엔진 생성 지연 → Railway 헬스가 포트 오픈까지 기다리는 시간 단축."""
    global _engine
    if _engine is None:
        with _lock:
            if _engine is None:
                _engine = create_async_engine(
                    get_settings().database_url,
                    echo=False,
                    pool_pre_ping=True,
                )
                print("database: async engine created", flush=True)
    return _engine


def _get_session_factory():
    global _session_factory
    if _session_factory is None:
        with _lock:
            if _session_factory is None:
                _session_factory = async_sessionmaker(
                    get_engine(), class_=AsyncSession, expire_on_commit=False
                )
    return _session_factory


class _AsyncSessionLocalProxy:
    def __call__(self, *args, **kwargs):
        return _get_session_factory()(*args, **kwargs)


AsyncSessionLocal = _AsyncSessionLocalProxy()


class _EngineProxy:
    def __getattr__(self, name):
        return getattr(get_engine(), name)

    async def dispose(self):
        global _engine, _session_factory
        e = None
        with _lock:
            e = _engine
            _engine = None
            _session_factory = None
        if e is not None:
            await e.dispose()


engine = _EngineProxy()


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
