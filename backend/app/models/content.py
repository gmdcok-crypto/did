from sqlalchemy import String, DateTime, ForeignKey, Integer, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
import enum
from app.database import Base


class ContentType(str, enum.Enum):
    video = "video"
    image = "image"
    html = "html"


class Content(Base):
    __tablename__ = "contents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(20))  # video, image, html
    url: Mapped[str] = mapped_column(String(500))
    duration_sec: Mapped[int] = mapped_column(Integer, default=10)
    name: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
