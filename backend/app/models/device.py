from __future__ import annotations
from sqlalchemy import String, DateTime, ForeignKey, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from typing import Optional
from app.database import Base


class DeviceGroup(Base):
    __tablename__ = "device_groups"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    devices: Mapped[list["Device"]] = relationship("Device", back_populates="group")


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)  # UUID
    name: Mapped[str] = mapped_column(String(100), default="")
    location: Mapped[str] = mapped_column(String(200), default="")
    group_id: Mapped[Optional[int]] = mapped_column(ForeignKey("device_groups.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="offline")  # online, offline, error
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    registered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # 등록 완료 시각(있으면 목록 표시)
    # CMS \"실시간 화면\" 요청 시 플레이어가 한 번 캡처해 업로드
    live_screen_pending: Mapped[bool] = mapped_column(Boolean, default=False)
    live_screen_ticket: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    live_screen_last_ticket: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    live_screen_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)  # upload_dir 기준 상대경로
    live_screen_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    group: Mapped[Optional["DeviceGroup"]] = relationship("DeviceGroup", back_populates="devices")
