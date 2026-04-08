from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
        # Railway MariaDB 등에서 mysql:// 로 주는 경우 aiomysql 드라이버 접두사로 통일
        if isinstance(v, str) and v.startswith("mysql://") and not v.startswith("mysql+aiomysql://"):
            return "mysql+aiomysql://" + v[len("mysql://") :]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
