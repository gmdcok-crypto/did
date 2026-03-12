from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from urllib.parse import urlparse
import asyncio
from app.database import get_db
from app.models import Device, Schedule, Campaign, CampaignContent, Content
from app.sse_broadcast import subscribe_schedule, unsubscribe_schedule, broadcast_device_list_updated

router = APIRouter(prefix="/player", tags=["player"])


def _media_url_for_request(url: str, base_url: str) -> str:
    """
    미디어 URL을 플레이어와 같은 출처로 쓸 수 있게 함.
    - /uploads/... 는 그대로 반환 → 브라우저가 현재 origin(예: https://192.168.0.23:5174) + /uploads/... 로 요청하고,
      Vite 프록시가 백엔드로 전달하므로 PC/태블릿 모두 동작.
    - 백엔드 호스트의 절대 URL이면 경로만 반환.
    - 그 외 http → https 변환 (mixed content 방지).
    """
    if not url or not url.strip():
        return url
    base = base_url.rstrip("/")
    if url.startswith("/uploads"):
        return url  # 상대 경로로 반환 → 항상 플레이어와 같은 출처
    if url.startswith("/"):
        return base + url
    p = urlparse(url)
    b = urlparse(base)
    if p.netloc == b.netloc and p.path.startswith("/uploads"):
        return p.path + ("?" + p.query if p.query else "")  # 절대 URL이어도 경로만 반환
    if url.startswith("http://") and base.startswith("https://") and p.netloc == b.netloc:
        return "https://" + p.netloc + p.path + ("?" + p.query if p.query else "")
    return url


async def _schedule_events_generator():
    q = subscribe_schedule()
    try:
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=25)
                yield f"data: {msg}\n\n"
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        unsubscribe_schedule(q)


@router.get("/events")
async def player_schedule_events():
    """SSE: 스케줄 저장/수정/삭제 시 플레이어가 구독하여 스케줄 즉시 재조회"""
    return StreamingResponse(
        _schedule_events_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class ZoneItem(BaseModel):
    id: str
    ratio: float
    content_type: str
    items: list


class ScheduleResponse(BaseModel):
    layout_id: str
    layout_config: Optional[dict]
    zones: list


@router.get("/schedule", response_model=ScheduleResponse)
async def get_schedule(
    request: Request,
    device_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Update last_seen and status so CMS shows device as online
    device.status = "online"
    device.last_seen = datetime.utcnow()
    await db.flush()
    broadcast_device_list_updated()

    # Find active schedule for this device's group
    result = await db.execute(
        select(Schedule)
        .where(Schedule.device_group_id == device.group_id, Schedule.is_active == True)
        .order_by(Schedule.id.desc())
        .limit(1)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        return ScheduleResponse(
            layout_id="full",
            layout_config=None,
            zones=[
                ZoneItem(
                    id="zone_1",
                    ratio=1.0,
                    content_type="placeholder",
                    items=[{"type": "placeholder", "url": "", "duration_sec": 10}],
                )
            ],
        )

    # Load campaign and contents
    result = await db.execute(
        select(Campaign).where(Campaign.id == schedule.campaign_id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        return ScheduleResponse(layout_id="full", layout_config=None, zones=[])

    base_url = str(request.base_url).rstrip("/")
    layout_config = schedule.layout_config or {}

    # 풀 레이아웃 + 스케줄에 content_ids 있음 → 스케줄에서 고른 콘텐츠만 사용 (캠페인 소속 무시)
    if (schedule.layout_id or "full") == "full" and "content_ids" in layout_config:
        order_ids = layout_config["content_ids"]
        if not order_ids:
            contents = []
        else:
            result = await db.execute(select(Content).where(Content.id.in_(order_ids)))
            content_rows = {c.id: c for c in result.scalars().all()}
            contents = []
            for cid in order_ids:
                if cid in content_rows:
                    c = content_rows[cid]
                    contents.append({
                        "id": c.id,
                        "type": c.type,
                        "url": _media_url_for_request(c.url, base_url),
                        "duration_sec": c.duration_sec,
                        "name": c.name,
                    })
    else:
        # 캠페인 소속 콘텐츠 기준 (분할 레이아웃 또는 content_ids 없을 때)
        result = await db.execute(
            select(CampaignContent, Content)
            .join(Content, CampaignContent.content_id == Content.id)
            .where(CampaignContent.campaign_id == campaign.id)
            .order_by(CampaignContent.order)
        )
        rows = result.all()
        contents_ordered = [
            {
                "id": c.id,
                "type": c.type,
                "url": _media_url_for_request(c.url, base_url),
                "duration_sec": c.duration_sec,
                "name": c.name,
            }
            for _, c in rows
        ]
        if (schedule.layout_id or "full") == "full" and layout_config.get("content_ids"):
            order_ids = layout_config["content_ids"]
            by_id = {it["id"]: it for it in contents_ordered}
            contents = [by_id[cid] for cid in order_ids if cid in by_id]
            if order_ids:
                for it in contents_ordered:
                    if it["id"] not in order_ids:
                        contents.append(it)
        else:
            contents = contents_ordered

    async def get_contents_for_zone(zone_config):
        content_ids = zone_config.get("content_ids")
        if not content_ids:
            return contents
        result = await db.execute(select(Content).where(Content.id.in_(content_ids)))
        by_id = {
            c.id: {
                "id": c.id,
                "type": c.type,
                "url": _media_url_for_request(c.url, base_url),
                "duration_sec": c.duration_sec,
                "name": c.name,
            }
            for c in result.scalars().all()
        }
        return [by_id[cid] for cid in content_ids if cid in by_id]

    zones_config = layout_config.get("zones")
    if not zones_config:
        layout_id = schedule.layout_id or "full"
        if layout_id == "split_h":
            zones_config = [
                {"id": "zone_1", "ratio": 0.5, "content_type": "video"},
                {"id": "zone_2", "ratio": 0.5, "content_type": "video"},
            ]
        elif layout_id == "split_v":
            zones_config = [
                {"id": "zone_1", "ratio": 0.5, "content_type": "video"},
                {"id": "zone_2", "ratio": 0.5, "content_type": "video"},
            ]
        else:
            zones_config = [{"id": "zone_1", "ratio": 1.0, "content_type": "video"}]
    if not zones_config:
        zones_config = [{"id": "zone_1", "ratio": 1.0, "content_type": "video"}]

    zones = []
    for i, z in enumerate(zones_config):
        zone_items = await get_contents_for_zone(z)
        if not zone_items:
            zone_items = [{"type": "placeholder", "url": "", "duration_sec": 10}]
        zones.append(
            ZoneItem(
                id=z.get("id", f"zone_{i+1}"),
                ratio=float(z.get("ratio", 1.0)),
                content_type=z.get("content_type", "video"),
                items=zone_items,
            )
        )
    if not zones:
        zones = [
            ZoneItem(id="zone_1", ratio=1.0, content_type="video", items=contents)
        ]

    return ScheduleResponse(
        layout_id=schedule.layout_id or "full",
        layout_config=schedule.layout_config,
        zones=zones,
    )
