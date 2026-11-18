"""중앙 did_monitor용 읽기 전용 요약 API."""

from __future__ import annotations

import hmac
from datetime import timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.device_time import is_last_seen_stale
from app.models import Campaign, Content, Device, Schedule

router = APIRouter(prefix="/monitor", tags=["monitor"])


class MonitorSummaryResponse(BaseModel):
    ok: bool = True
    devices_total: int
    devices_online: int
    devices_offline: int
    campaigns: int
    schedules: int
    contents: int


def _require_monitor_token(
    x_monitor_token: str | None = Header(default=None, alias="X-Monitor-Token"),
    authorization: str | None = Header(default=None),
) -> None:
    settings = get_settings()
    expected = (settings.monitor_token or "").strip()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="MONITOR_TOKEN이 설정되지 않았습니다. Railway Variables에 MONITOR_TOKEN을 넣으세요.",
        )

    provided = (x_monitor_token or "").strip()
    if not provided and authorization:
        auth = authorization.strip()
        if auth.lower().startswith("bearer "):
            provided = auth[7:].strip()

    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="모니터 토큰이 올바르지 않습니다.")


@router.get("/summary", response_model=MonitorSummaryResponse)
async def monitor_summary(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_monitor_token),
):
    """고객 DID 인스턴스 요약 — DB 직접 접속 없이 did_monitor가 호출."""
    settings = get_settings()
    max_age = timedelta(seconds=max(60, settings.device_offline_after_seconds))

    devices = (await db.execute(select(Device))).scalars().all()
    online = 0
    offline = 0
    for d in devices:
        if is_last_seen_stale(d.last_seen, max_age):
            offline += 1
        elif (d.status or "").lower() == "online":
            online += 1
        else:
            offline += 1

    campaigns = int(
        (await db.execute(select(func.count()).select_from(Campaign))).scalar_one() or 0
    )
    schedules = int(
        (await db.execute(select(func.count()).select_from(Schedule))).scalar_one() or 0
    )
    contents = int(
        (await db.execute(select(func.count()).select_from(Content))).scalar_one() or 0
    )

    return MonitorSummaryResponse(
        devices_total=len(devices),
        devices_online=online,
        devices_offline=offline,
        campaigns=campaigns,
        schedules=schedules,
        contents=contents,
    )
