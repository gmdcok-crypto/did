from sqlalchemy import String, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
import enum
from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default=UserRole.editor.value)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
