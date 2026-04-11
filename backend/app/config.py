from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
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
    # Cloudflare R2 (S3 호환). 아래가 모두 채워지면 미디어 업로드는 R2 버킷으로만 저장됩니다.
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = "did"
    # 공개 접근 URL 접두어(슬래시 없음). 예: https://pub-xxxx.r2.dev 또는 커스텀 도메인
    r2_public_base_url: str = ""
    # 회사에서만 아는 디바이스 등록용 인증코드 (플레이어가 등록 시 필수)
    registration_auth_code: str = "dev1234"
    # DDNS/외부 접속 시 CORS 허용 출처 (쉼표 구분). 예: https://noteserver.iptime.org:5173,https://noteserver.iptime.org:5174
    cors_origins_extra: str = ""
    # last_seen 갱신 없이 이 시간(초)이 지나면 offline (스케줄 폴링 주기보다 길게 설정할 것 — 기본 180초=3분, 폴링 2분)
    device_offline_after_seconds: int = 180
    # 실시간 화면 WebSocket 다중 인스턴스 공유 (Railway Redis 플러그인 → REDIS_URL 자동 주입)
    redis_url: str = Field(
        default="",
        validation_alias=AliasChoices("REDIS_URL", "redis_url"),
    )

    @field_validator("r2_bucket", mode="before")
    @classmethod
    def r2_bucket_from_env_aliases(cls, v):
        """R2_BUCKET_NAME(Railway)·R2_BUCKET·필드값 순으로 버킷 이름 결정."""
        import os

        name = (os.environ.get("R2_BUCKET_NAME") or "").strip().strip('"').strip("'")
        if name:
            return name
        alt = (os.environ.get("R2_BUCKET") or "").strip().strip('"').strip("'")
        if alt:
            return alt
        if isinstance(v, str) and v.strip():
            return v.strip()
        return "did"

    @field_validator(
        "r2_account_id",
        "r2_access_key_id",
        "r2_secret_access_key",
        "r2_public_base_url",
        mode="after",
    )
    @classmethod
    def strip_r2_env_whitespace(cls, v: str) -> str:
        """Railway 붙여넣기 시 시크릿/URL 앞뒤 줄바꿈·공백 제거."""
        if isinstance(v, str):
            return v.strip()
        return v

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
