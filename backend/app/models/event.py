from sqlalchemy import String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.database import Base


class PlaybackEvent(Base):
    __tablename__ = "playback_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"))
    content_id: Mapped[int] = mapped_column(ForeignKey("contents.id"))
    event_type: Mapped[str] = mapped_column(String(20))  # impression, click, complete, error
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
