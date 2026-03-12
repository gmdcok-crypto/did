from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.database import get_db
from app.models import Device, PlaybackEvent
from sqlalchemy import select

router = APIRouter(prefix="/events", tags=["events"])


class EventItem(BaseModel):
    content_id: int
    event_type: str  # impression, click, complete, error


class EventsBatchRequest(BaseModel):
    device_id: str
    events: list[EventItem]


@router.post("/batch")
async def submit_events(
    data: EventsBatchRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Device).where(Device.device_id == data.device_id))
    device = result.scalar_one_or_none()
    if not device:
        return {"ok": False, "detail": "Device not found"}
    for ev in data.events:
        event = PlaybackEvent(
            device_id=device.id,
            content_id=ev.content_id,
            event_type=ev.event_type,
        )
        db.add(event)
    await db.flush()
    return {"ok": True}
