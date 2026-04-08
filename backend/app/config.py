from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _prepare_database_url_from_mysql() -> None:
    """Railway: MariaDB 플러그인은 MYSQL_URL만 줄 때가 많음. DATABASE_URL이 없으면 복사."""
    import os

    try:
        from dotenv import load_dotenv

        env_path = Path(__file__).resolve().parent.parent / ".env"
        if env_path.is_file():
            load_dotenv(env_path)
    except ImportError:
        pass

    if os.environ.get("DATABASE_URL", "").strip():
        return
    mysql = os.environ.get("MYSQL_URL", "").strip()
    if mysql:
        os.environ["DATABASE_URL"] = mysql


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./app.db"
    secret_key: str = "dev-secret-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    upload_dir: str = "./uploads"
    media_base_url: str = ""
    # 회사에서만 아는 디바이스 등록용 인증코드 (플레이어가 등록 시 필수)
    registration_auth_code: str = "dev1234"
    # DDNS/외부 접속 시 CORS 허용 출처 (쉼표 구분). 예: https://noteserver.iptime.org:5173,https://noteserver.iptime.org:5174
    cors_origins_extra: str = ""

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, v: object) -> object:
        # Railway mysql:// → asyncmy (aiomysql 대비 greenlet/libstdc++ 이슈 완화)
        if not isinstance(v, str):
            return v
        s = v
        if s.startswith("mysql+aiomysql://"):
            return "mysql+asyncmy://" + s[len("mysql+aiomysql://") :]
        if s.startswith("mysql://") and not s.startswith("mysql+asyncmy://"):
            return "mysql+asyncmy://" + s[len("mysql://") :]
        return v


@lru_cache
def get_settings() -> Settings:
    _prepare_database_url_from_mysql()
    return Settings()
