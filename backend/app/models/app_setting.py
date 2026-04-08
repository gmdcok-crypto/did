from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# 키 상수: 디바이스 등록 시 플레이어가 보내는 auth_code와 비교
REGISTRATION_AUTH_KEY = "registration_auth_code"


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
