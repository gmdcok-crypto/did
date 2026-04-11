from __future__ import annotations
from sqlalchemy import String, DateTime, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from typing import Optional
from app.database import Base


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"))
    device_group_id: Mapped[int] = mapped_column(ForeignKey("device_groups.id"))
    layout_id: Mapped[str] = mapped_column(String(50), default="full")  # full, full_portrait, split_h, split_v, etc.
    layout_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ScheduleSlot(Base):
    """시간대별 스케줄 (선택 구현: 요일/시간대별 재생 제한)"""
    __tablename__ = "schedule_slots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    schedule_id: Mapped[int] = mapped_column(ForeignKey("schedules.id"))
    start_time: Mapped[str] = mapped_column(String(5), default="00:00")  # HH:MM
    end_time: Mapped[str] = mapped_column(String(5), default="23:59")
    days_of_week: Mapped[str] = mapped_column(String(20), default="0,1,2,3,4,5,6")  # 0=Mon
