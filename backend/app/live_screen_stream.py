"""CMS 실시간 화면: 플레이어 프레임을 Redis Pub/Sub 또는 인메모리로 CMS에 전달.

- REDIS_URL 이 있으면 모든 API 인스턴스가 동일 채널을 구독 → Railway 다중 워커에서도 스트림 유지.
- 없으면 기존처럼 단일 프로세스 메모리 허브만 사용."""
from __future__ import annotations

import asyncio
import logging
from typing import Dict, List, Optional

from app.config import get_settings

logger = logging.getLogger(__name__)

try:
    import redis.asyncio as aioredis
except ImportError:  # pragma: no cover
    aioredis = None


class LiveScreenStreamHub:
    """단일 프로세스용 폴백(로컬 개발·Redis 미설정)."""

    def __init__(self) -> None:
        self._subs: Dict[str, List[asyncio.Queue]] = {}
        self._last: Dict[str, bytes] = {}

    def subscriber_count(self, device_id: str) -> int:
        return len(self._subs.get(device_id, []))

    def subscribe(self, device_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=4)
        self._subs.setdefault(device_id, []).append(q)
        last = self._last.get(device_id)
        if last and len(last) >= 32:
            try:
                q.put_nowait(last)
            except asyncio.QueueFull:
                pass
        return q

    def unsubscribe(self, device_id: str, q: asyncio.Queue) -> None:
        lst = self._subs.get(device_id)
        if not lst:
            return
        if q in lst:
            lst.remove(q)
        if not lst:
            del self._subs[device_id]

    def push_frame(self, device_id: str, jpeg: bytes) -> None:
        if len(jpeg) < 32:
            return
        self._last[device_id] = jpeg
        for q in self._subs.get(device_id, []):
            try:
                while not q.empty():
                    try:
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                q.put_nowait(jpeg)
            except Exception:
                pass


hub = LiveScreenStreamHub()

_redis = None  # redis.asyncio.Redis | None


def redis_channel(device_id: str) -> str:
    return f"did:live_screen:{device_id}"


def redis_last_frame_key(device_id: str) -> str:
    """Pub/Sub 구독 전에 발행된 프레임은 유실되므로, 마지막 JPEG를 잠깐 저장해 늦게 붙은 CMS에도 전달."""
    return f"did:live_screen:last:{device_id}"


async def get_redis():
    """REDIS_URL / Settings.redis_url 이 있을 때만 클라이언트 생성."""
    global _redis
    if aioredis is None:
        return None
    url = (get_settings().redis_url or "").strip()
    if not url:
        return None
    if _redis is None:
        _redis = aioredis.from_url(url, decode_responses=False)
    return _redis


async def push_frame(device_id: str, jpeg: bytes) -> None:
    """플레이어가 보낸 JPEG: Redis 우선, 실패 시 인메모리 허브."""
    if len(jpeg) < 32:
        return
    r = await get_redis()
    if r:
        try:
            # 구독자가 없을 때 publish만 하면 CMS는 영원히 빈 화면 → last 키로 최신 1장 보존
            await r.setex(redis_last_frame_key(device_id), 120, jpeg)
            await r.publish(redis_channel(device_id), jpeg)
            return
        except Exception as e:
            logger.warning("live_screen redis publish failed, using in-memory hub: %s", e)
    hub.push_frame(device_id, jpeg)
