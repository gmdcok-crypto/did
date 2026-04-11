"""CMS 실시간 화면: 플레이어 프레임을 Redis Pub/Sub 또는 인메모리로 CMS에 전달.

- REDIS_URL 이 있으면 모든 API 인스턴스가 동일 채널을 구독 → Railway 다중 워커에서도 스트림 유지.
- 없으면 기존처럼 단일 프로세스 메모리 허브만 사용."""
from __future__ import annotations

import asyncio
import logging
import ssl
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

    def last_frame(self, device_id: str) -> Optional[bytes]:
        b = self._last.get(device_id)
        if b and len(b) >= 32:
            return b
        return None

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
_redis_connect_error: Optional[str] = None


def redis_channel(device_id: str) -> str:
    return f"did:live_screen:{device_id}"


def redis_last_frame_key(device_id: str) -> str:
    """Pub/Sub 구독 전에 발행된 프레임은 유실되므로, 마지막 JPEG를 잠깐 저장해 늦게 붙은 CMS에도 전달."""
    return f"did:live_screen:last:{device_id}"


def _redis_from_url(url: str):
    """Railway 등 rediss:// TLS — Python 3.13+ 엄격 X509 검증 실패 시 연결 거부되는 경우가 있어 완화."""
    if url.lower().startswith("rediss://"):
        ctx = ssl.create_default_context()
        try:
            ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
        except AttributeError:
            pass
        return aioredis.from_url(url, decode_responses=False, ssl=ctx)
    return aioredis.from_url(url, decode_responses=False)


async def get_redis():
    """REDIS_URL / Settings.redis_url 이 있을 때만 클라이언트 생성."""
    global _redis, _redis_connect_error
    if aioredis is None:
        return None
    url = (get_settings().redis_url or "").strip()
    if not url:
        return None
    if _redis is None:
        try:
            _redis = _redis_from_url(url)
            _redis_connect_error = None
        except Exception as e:
            _redis_connect_error = str(e)
            logger.warning("redis client create failed: %s", e)
            return None
    return _redis


async def get_last_jpeg(device_id: str) -> Optional[bytes]:
    """CMS HTTP 폴백: Redis last 키 또는 인메모리 마지막 프레임."""
    did = (device_id or "").strip()
    if not did:
        return None
    r = await get_redis()
    if r:
        try:
            b = await r.get(redis_last_frame_key(did))
            if b and len(b) >= 32:
                return b
        except Exception as e:
            logger.warning("get_last_jpeg redis get: %s", e)
    return hub.last_frame(did)


async def check_redis_live_screen() -> dict:
    """헬스/진단: 멀티 인스턴스 실시간 화면에 Redis 필요 여부."""
    url = (get_settings().redis_url or "").strip()
    if not url:
        return {
            "redis_configured": False,
            "redis_ping_ok": None,
            "detail": "REDIS_URL unset — multi-instance live screen needs Redis + pub/sub",
        }
    if aioredis is None:
        return {
            "redis_configured": True,
            "redis_ping_ok": False,
            "detail": "redis package not installed",
        }
    try:
        r = await get_redis()
        if not r:
            return {
                "redis_configured": True,
                "redis_ping_ok": False,
                "detail": _redis_connect_error or "client not created",
            }
        await r.ping()
        return {"redis_configured": True, "redis_ping_ok": True, "detail": "ok"}
    except Exception as e:
        d = str(e)
        if _redis_connect_error:
            d = f"{d}; connect_error={_redis_connect_error}"
        return {"redis_configured": True, "redis_ping_ok": False, "detail": d}


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
