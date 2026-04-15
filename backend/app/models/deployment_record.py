"""운영자용: 여러 고객 배포(Railway URL, DB명, R2 등) 메타데이터. 비밀번호는 저장하지 않음."""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DeploymentRecord(Base):
    __tablename__ = "deployment_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    railway_project_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    public_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    mysql_database: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    r2_bucket: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    r2_public_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
