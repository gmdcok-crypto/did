"""미디어(contents)가 캠페인·스케줄에서 참조되는지 판별."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CampaignContent, Schedule


def _ids_list_contains(ids: Any, content_id: int) -> bool:
    if not isinstance(ids, list):
        return False
    for x in ids:
        try:
            if int(x) == content_id:
                return True
        except (TypeError, ValueError):
            continue
    return False


def layout_config_refs_content_id(layout_config: Optional[dict], content_id: int) -> bool:
    """스케줄 layout_config JSON 안에 해당 content_id 가 있는지."""
    if not layout_config or not isinstance(layout_config, dict):
        return False
    if _ids_list_contains(layout_config.get("content_ids"), content_id):
        return True
    zones = layout_config.get("zones")
    if not isinstance(zones, list):
        return False
    for z in zones:
        if isinstance(z, dict) and _ids_list_contains(z.get("content_ids"), content_id):
            return True
    return False


async def content_is_in_use(db: AsyncSession, content_id: int) -> bool:
    r = await db.execute(
        select(CampaignContent.id).where(CampaignContent.content_id == content_id).limit(1)
    )
    if r.scalar_one_or_none() is not None:
        return True
    r2 = await db.execute(select(Schedule))
    for s in r2.scalars().all():
        if layout_config_refs_content_id(s.layout_config, content_id):
            return True
    return False
