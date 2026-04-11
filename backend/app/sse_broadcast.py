"""SSE 브로드캐스트: 디바이스 등록/수정 시 연결된 CMS 클라이언트에 알림

실시간 화면 요청/중지는 Railway 다중 워커에서 인메모리 큐만으로는 다른 인스턴스의 플레이어 SSE에
도달하지 않음. REDIS_URL 이 있으면 Redis 채널로 모든 워커에 전달 후 로컬 schedule 큐에 넣음."""
import asyncio
import logging
from typing import List

logger = logging.getLogger(__name__)

_queues: List[asyncio.Queue] = []

# CMS 실시간 화면 알림 — 모든 uvicorn 워커가 구독
REDIS_LIVE_SCREEN_SSE_CHANNEL = "did:live_screen:sse"


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _queues.append(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    if q in _queues:
        _queues.remove(q)


def broadcast_device_list_updated() -> None:
    for q in _queues:
        try:
            q.put_nowait("device_list_updated")
        except asyncio.QueueFull:
            pass


def broadcast_cms_dashboard_updated() -> None:
    """캠페인·미디어·스케줄 등 대시보드 KPI가 바뀔 때 CMS가 전체 통계를 다시 불러오도록."""
    for q in _queues:
        try:
            q.put_nowait("cms_dashboard_updated")
        except asyncio.QueueFull:
            pass


_schedule_queues: List[asyncio.Queue] = []


def subscribe_schedule() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _schedule_queues.append(q)
    return q


def unsubscribe_schedule(q: asyncio.Queue) -> None:
    if q in _schedule_queues:
        _schedule_queues.remove(q)


def broadcast_schedule_updated() -> None:
    for q in _schedule_queues:
        try:
            q.put_nowait("schedule_updated")
        except asyncio.QueueFull:
            pass


def _put_all_schedule_queues(msg: str) -> None:
    for q in _schedule_queues:
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            pass


def _schedule_live_screen_redis_or_local(msg: str) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        _put_all_schedule_queues(msg)
        return
    loop.create_task(_broadcast_live_screen_redis_or_local_async(msg))


async def _broadcast_live_screen_redis_or_local_async(msg: str) -> None:
    from app.live_screen_stream import get_redis

    r = await get_redis()
    if r:
        try:
            await r.publish(REDIS_LIVE_SCREEN_SSE_CHANNEL, msg)
            return
        except Exception as e:
            logger.warning("live_screen SSE notify redis publish failed, local queues only: %s", e)
    _put_all_schedule_queues(msg)


def broadcast_live_screen_request(device_id: str) -> None:
    """CMS가 실시간 화면을 요청했을 때 해당 기기 플레이어(SSE 구독)에 즉시 알림."""
    if not (device_id or "").strip():
        return
    msg = f"live_screen_request:{device_id.strip()}"
    _schedule_live_screen_redis_or_local(msg)


def broadcast_live_screen_stop(device_id: str) -> None:
    """CMS가 실시간 화면을 닫았을 때 플레이어가 스트림 전송을 중단하도록 알림."""
    if not (device_id or "").strip():
        return
    msg = f"live_screen_stop:{device_id.strip()}"
    _schedule_live_screen_redis_or_local(msg)


async def run_redis_sse_bridge() -> None:
    """REDIS_URL 이 있을 때 모든 워커가 live_screen SSE 메시지를 수신해 로컬 큐로 전달."""
    while True:
        try:
            from app.live_screen_stream import get_redis

            r = await get_redis()
        except Exception:
            r = None
        if not r:
            await asyncio.sleep(2.0)
            continue
        pubsub = r.pubsub()
        try:
            await pubsub.subscribe(REDIS_LIVE_SCREEN_SSE_CHANNEL)
            logger.info("redis_sse_bridge subscribed to %s", REDIS_LIVE_SCREEN_SSE_CHANNEL)
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                data = message.get("data")
                if isinstance(data, bytes):
                    data = data.decode("utf-8", errors="replace")
                if not data or not isinstance(data, str):
                    continue
                if not (
                    data.startswith("live_screen_request:")
                    or data.startswith("live_screen_stop:")
                ):
                    continue
                for q in _schedule_queues:
                    try:
                        q.put_nowait(data)
                    except asyncio.QueueFull:
                        pass
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("redis_sse_bridge: %s — reconnecting", e)
            await asyncio.sleep(2.0)
        finally:
            try:
                await pubsub.unsubscribe(REDIS_LIVE_SCREEN_SSE_CHANNEL)
                await pubsub.close()
            except Exception:
                pass
