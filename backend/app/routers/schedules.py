from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from app.database import get_db
from app.models import Schedule, Campaign, DeviceGroup, User
from app.deps import get_current_user
from app.layout_rules import is_layout_allowed_for_orientation, normalize_layout_id
from app.sse_broadcast import broadcast_schedule_updated, broadcast_cms_dashboard_updated

router = APIRouter(prefix="/schedules", tags=["schedules"])


async def _validate_group_layout_compatibility(
    db: AsyncSession,
    device_group_id: int,
    layout_id: str,
) -> None:
    result = await db.execute(select(DeviceGroup).where(DeviceGroup.id == device_group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Device group not found")
    if not is_layout_allowed_for_orientation(layout_id, group.orientation):
        orientation_label = "세로형" if group.orientation == "portrait" else "가로형"
        raise HTTPException(
            status_code=400,
            detail=(
                f'"{group.name}" 그룹은 {orientation_label} 그룹입니다. '
                f'선택한 레이아웃 "{normalize_layout_id(layout_id)}"은 사용할 수 없습니다.'
            ),
        )


class ScheduleCreate(BaseModel):
    name: str
    campaign_id: int
    device_group_id: int
    layout_id: str = "full"
    layout_config: Optional[dict] = None


class ScheduleUpdate(BaseModel):
    name: Optional[str] = None
    campaign_id: Optional[int] = None
    device_group_id: Optional[int] = None
    layout_id: Optional[str] = None
    layout_config: Optional[dict] = None
    is_active: Optional[bool] = None


class ScheduleItem(BaseModel):
    id: int
    name: str
    campaign_id: int
    device_group_id: int
    layout_id: str
    layout_config: Optional[dict] = None
    is_active: bool

    class Config:
        from_attributes = True


@router.get("", response_model=list[ScheduleItem])
async def list_schedules(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Schedule).order_by(Schedule.id.desc()))
    return result.scalars().all()


@router.post("", response_model=ScheduleItem)
async def create_schedule(
    data: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _validate_group_layout_compatibility(db, data.device_group_id, data.layout_id)
    s = Schedule(
        name=data.name,
        campaign_id=data.campaign_id,
        device_group_id=data.device_group_id,
        layout_id=normalize_layout_id(data.layout_id),
        layout_config=data.layout_config,
        updated_at=datetime.utcnow(),
    )
    db.add(s)
    await db.flush()
    await db.refresh(s)
    await db.commit()
    broadcast_schedule_updated()
    broadcast_cms_dashboard_updated()
    return s


@router.patch("/{schedule_id}", response_model=ScheduleItem)
async def update_schedule(
    schedule_id: int,
    data: ScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Schedule).where(Schedule.id == schedule_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    next_group_id = data.device_group_id if data.device_group_id is not None else s.device_group_id
    next_layout_id = data.layout_id if data.layout_id is not None else s.layout_id
    await _validate_group_layout_compatibility(db, next_group_id, next_layout_id)
    if data.name is not None:
        s.name = data.name
    if data.campaign_id is not None:
        s.campaign_id = data.campaign_id
    if data.device_group_id is not None:
        s.device_group_id = data.device_group_id
    if data.layout_id is not None:
        s.layout_id = normalize_layout_id(data.layout_id)
    if data.layout_config is not None:
        s.layout_config = data.layout_config
    if data.is_active is not None:
        s.is_active = data.is_active
    s.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(s)
    await db.commit()
    broadcast_schedule_updated()
    broadcast_cms_dashboard_updated()
    return s


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Schedule).where(Schedule.id == schedule_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.delete(s)
    await db.flush()
    await db.commit()
    broadcast_schedule_updated()
    broadcast_cms_dashboard_updated()
