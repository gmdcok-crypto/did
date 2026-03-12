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
