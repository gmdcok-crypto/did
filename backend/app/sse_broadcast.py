"""SSE 브로드캐스트: 디바이스 등록/수정 시 연결된 CMS 클라이언트에 알림"""
import asyncio
from typing import List

_queues: List[asyncio.Queue] = []


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


def broadcast_live_screen_request(device_id: str) -> None:
    """CMS가 실시간 화면을 요청했을 때 해당 기기 플레이어(SSE 구독)에 즉시 알림."""
    if not (device_id or "").strip():
        return
    msg = f"live_screen_request:{device_id.strip()}"
    for q in _schedule_queues:
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            pass
