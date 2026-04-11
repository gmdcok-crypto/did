"""디바이스 last_seen 등 DB datetime을 UTC naive와 비교할 때 사용 (MariaDB/MySQL·드라이버별 tz 차이 방지)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional


def now_utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utc_naive_from_db(dt: Optional[datetime]) -> Optional[datetime]:
    """DB에서 읽은 시각을 UTC naive로 통일. naive는 이미 UTC로 저장됐다고 가정."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def is_last_seen_stale(last_seen: Optional[datetime], max_age: timedelta) -> bool:
    """전원 OFF 등으로 last_seen이 max_age 이상 지났으면 True."""
    ls = utc_naive_from_db(last_seen)
    if ls is None:
        return True
    now = now_utc_naive()
    if ls > now + timedelta(minutes=5):
        # DB/서버 시각이 크게 꼬인 경우 — 오프라인으로 처리
        return True
    effective = ls if ls <= now else now
    return (now - effective) > max_age
