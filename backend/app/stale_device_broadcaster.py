"""last_seen 만료 시 DB status 를 offline 으로 맞추고 CMS SSE 로 알림 (목록 조회 없이도 실시간에 가깝게)."""
import asyncio
from datetime import timedelta

from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.device_time import is_last_seen_stale
from app.models import Device
from app.sse_broadcast import broadcast_device_list_updated


async def run_stale_device_broadcaster(interval_seconds: float = 40.0) -> None:
    await asyncio.sleep(8)
    while True:
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(Device).order_by(Device.id))
                devices = result.scalars().all()
                settings = get_settings()
                max_age = timedelta(seconds=max(60, settings.device_offline_after_seconds))
                stale_updated = False
                for d in devices:
                    too_old = is_last_seen_stale(d.last_seen, max_age)
                    if too_old and (d.status or "") == "online":
                        d.status = "offline"
                        stale_updated = True
                if stale_updated:
                    await db.commit()
                    broadcast_device_list_updated()
        except Exception as e:
            print(f"[stale_device_broadcaster] {e}", flush=True)
        await asyncio.sleep(interval_seconds)
