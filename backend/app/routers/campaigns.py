from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from app.database import get_db
from app.models import Campaign, CampaignContent, User
from app.deps import get_current_user
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


class CampaignCreate(BaseModel):
    name: str
    start_at: datetime
    end_at: datetime
    priority: int = 0
    content_ids: list[int] = []


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    priority: Optional[int] = None
    content_ids: Optional[list[int]] = None


class CampaignItem(BaseModel):
    id: int
    name: str
    start_at: datetime
    end_at: datetime
    priority: int
    created_at: datetime

    class Config:
        from_attributes = True


class CampaignDetail(CampaignItem):
    content_ids: list[int] = []


@router.get("", response_model=list[CampaignItem])
async def list_campaigns(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Campaign).order_by(Campaign.id.desc()))
    return result.scalars().all()


@router.post("", response_model=CampaignItem)
async def create_campaign(
    data: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = Campaign(
        name=data.name,
        start_at=data.start_at,
        end_at=data.end_at,
        priority=data.priority,
    )
    db.add(c)
    await db.flush()
    for i, cid in enumerate(data.content_ids):
        cc = CampaignContent(campaign_id=c.id, content_id=cid, order=i)
        db.add(cc)
    await db.refresh(c)
    return c


@router.get("/{campaign_id}", response_model=CampaignDetail)
async def get_campaign(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Campaign)
        .where(Campaign.id == campaign_id)
        .options(selectinload(Campaign.content_items))
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    content_ids = [cc.content_id for cc in c.content_items]
    return CampaignDetail(
        id=c.id,
        name=c.name,
        start_at=c.start_at,
        end_at=c.end_at,
        priority=c.priority,
        created_at=c.created_at,
        content_ids=content_ids,
    )


@router.patch("/{campaign_id}", response_model=CampaignItem)
async def update_campaign(
    campaign_id: int,
    data: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if data.name is not None:
        c.name = data.name
    if data.start_at is not None:
        c.start_at = data.start_at
    if data.end_at is not None:
        c.end_at = data.end_at
    if data.priority is not None:
        c.priority = data.priority
    if data.content_ids is not None:
        await db.execute(delete(CampaignContent).where(CampaignContent.campaign_id == campaign_id))
        for i, cid in enumerate(data.content_ids):
            cc = CampaignContent(campaign_id=c.id, content_id=cid, order=i)
            db.add(cc)
    await db.flush()
    await db.refresh(c)
    return c


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    await db.execute(delete(CampaignContent).where(CampaignContent.campaign_id == campaign_id))
    await db.delete(c)
    await db.flush()
