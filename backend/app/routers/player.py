from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
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
from app.config import get_settings
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
    prev_status = (device.status or "").strip().lower()
    device.status = "online"
    device.last_seen = datetime.utcnow()
    await db.flush()
    # 스케줄 폴링마다 브로드캐스트하면 CMS 디바이스 탭 SSE가 매번 목록을 다시 불러 깜박임 →
    # 오프라인/에러에서 온라인으로 바뀔 때 등 의미 있는 변화에만 알림
    if prev_status != "online":
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
        # zones=[] 를 주면 플레이어가 Zone을 하나도 안 그려 전체 검은 화면만 됨
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


class PlayerOfflineIn(BaseModel):
    device_id: str


@router.post("/offline")
async def player_offline(data: PlayerOfflineIn, db: AsyncSession = Depends(get_db)):
    """브라우저 종료·탭 닫기 시 sendBeacon 으로 호출 — 즉시 오프라인 표시(last_seen 대기 없음)."""
    did = (data.device_id or "").strip()
    if not did:
        raise HTTPException(status_code=400, detail="device_id required")
    result = await db.execute(select(Device).where(Device.device_id == did))
    device = result.scalar_one_or_none()
    if not device:
        return {"ok": False}
    if device.status != "offline":
        device.status = "offline"
        await db.commit()
        broadcast_device_list_updated()
    return {"ok": True}


class LiveScreenPollResponse(BaseModel):
    capture: bool
    ticket: Optional[str] = None


@router.get("/live-screen-poll", response_model=LiveScreenPollResponse)
async def live_screen_poll(device_id: str, db: AsyncSession = Depends(get_db)):
    """플레이어가 주기적으로 호출. 캡처 요청이 있으면 capture=true 와 ticket 반환."""
    result = await db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        return LiveScreenPollResponse(capture=False)
    if device.live_screen_pending and (device.live_screen_ticket or "").strip():
        return LiveScreenPollResponse(capture=True, ticket=device.live_screen_ticket)
    return LiveScreenPollResponse(capture=False)


@router.post("/live-screen-upload")
async def live_screen_upload(
    device_id: str = Form(),
    ticket: str = Form(),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """플레이어가 캡처한 JPEG 업로드 (device_id·ticket 검증)."""
    result = await db.execute(select(Device).where(Device.device_id == device_id.strip()))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    t = (ticket or "").strip()
    if not device.live_screen_pending or (device.live_screen_ticket or "") != t:
        raise HTTPException(status_code=400, detail="유효하지 않은 캡처 요청입니다.")

    raw = await file.read()
    max_bytes = 6 * 1024 * 1024
    if len(raw) > max_bytes:
        raise HTTPException(status_code=413, detail="이미지가 너무 큽니다.")
    if len(raw) < 32:
        raise HTTPException(status_code=400, detail="빈 이미지입니다.")

    settings = get_settings()
    base = Path(settings.upload_dir)
    shot_dir = base / "screenshots"
    shot_dir.mkdir(parents=True, exist_ok=True)
    rel = f"screenshots/{device.device_id}.jpg"
    dest = base / rel
    if device.live_screen_path and device.live_screen_path != rel:
        try:
            old = base / device.live_screen_path
            if old.is_file():
                old.unlink()
        except OSError:
            pass
    dest.write_bytes(raw)

    device.live_screen_path = rel
    device.live_screen_pending = False
    device.live_screen_last_ticket = t
    device.live_screen_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}
