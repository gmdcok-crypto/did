"""API 응답용: DB naive UTC 시각 → 한국 표준시(Asia/Seoul) ISO 문자열."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")


def to_kst_iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(KST).isoformat(timespec="seconds")
