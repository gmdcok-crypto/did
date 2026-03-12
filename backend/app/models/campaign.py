from sqlalchemy import String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.database import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    start_at: Mapped[datetime] = mapped_column(DateTime)
    end_at: Mapped[datetime] = mapped_column(DateTime)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    content_items: Mapped[list["CampaignContent"]] = relationship(
        "CampaignContent", back_populates="campaign", order_by="CampaignContent.order"
    )


class CampaignContent(Base):
    __tablename__ = "campaign_contents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"))
    content_id: Mapped[int] = mapped_column(ForeignKey("contents.id"))
    order: Mapped[int] = mapped_column(Integer, default=0)

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="content_items")
