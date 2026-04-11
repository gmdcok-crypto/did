"""CMS 실시간 화면: 플레이어→서버 WebSocket으로 JPEG 프레임 수신 후 구독자(CMS)에게 전달.

단일 프로세스 메모리 기준(로컬·단일 Railway 인스턴스). 다중 인스턴스에서는 Redis 등 별도 브로커가 필요."""
import asyncio
from typing import Dict, List


class LiveScreenStreamHub:
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
