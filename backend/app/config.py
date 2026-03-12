from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
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

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
