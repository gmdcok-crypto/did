from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional
import uuid

from app.database import get_db
from app.models import Device, DeviceGroup, User, PlaybackEvent
from app.deps import get_current_user
from app.registration_code import get_effective_registration_auth_code
from app.sse_broadcast import subscribe, unsubscribe, broadcast_device_list_updated, broadcast_schedule_updated
from datetime import datetime

router = APIRouter(prefix="/devices", tags=["devices"])


class DeviceRegisterRequest(BaseModel):
    auth_code: str = ""  # 회사에서 정한 등록용 인증코드 (플레이어용)
    name: str = ""
    location: str = ""
    group_id: Optional[int] = None
    previous_device_id: Optional[str] = None  # 있으면 재등록: 기기 갱신 후 같은 ID 반환 (중복 행 방지)


class DeviceRegisterResponse(BaseModel):
    device_id: str


class DeviceListItem(BaseModel):
    id: int
    device_id: str
    name: str
    location: str
    group_id: Optional[int]
    status: str
    last_seen: Optional[str]

    class Config:
        from_attributes = True


@router.post("/register", response_model=DeviceRegisterResponse)
async def register_device(
    data: DeviceRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    expected = await get_effective_registration_auth_code(db)
    if not expected or (data.auth_code or "").strip() != expected:
        raise HTTPException(status_code=403, detail="인증코드가 올바르지 않습니다.")

    # 재등록: previous_device_id가 있고 해당 기기가 있으면 갱신 후 같은 ID 반환 (그룹에 중복 추가 안 됨)
    if data.previous_device_id and (data.previous_device_id or "").strip():
        prev_id = (data.previous_device_id or "").strip()
        r = await db.execute(select(Device).where(Device.device_id == prev_id))
        existing = r.scalar_one_or_none()
        if existing:
            existing.name = data.name or existing.name or "Device"
            existing.location = data.location or ""
            existing.registered_at = datetime.utcnow()
            if data.group_id is not None:
                existing.group_id = data.group_id
            else:
                gr = await db.execute(select(DeviceGroup).order_by(DeviceGroup.id).limit(1))
                default_group = gr.scalar_one_or_none()
                if default_group:
                    existing.group_id = default_group.id
            await db.flush()
            await db.refresh(existing)
            broadcast_device_list_updated()
            return DeviceRegisterResponse(device_id=existing.device_id)

    device_id = str(uuid.uuid4())
    group_id = data.group_id
    if group_id is None:
        r = await db.execute(select(DeviceGroup).order_by(DeviceGroup.id).limit(1))
        default_group = r.scalar_one_or_none()
        if default_group:
            group_id = default_group.id
    device = Device(
        device_id=device_id,
        name=data.name or "Device",
        location=data.location or "",
        group_id=group_id,
        registered_at=datetime.utcnow(),
    )
    db.add(device)
    await db.flush()
    await db.refresh(device)
    broadcast_device_list_updated()
    return DeviceRegisterResponse(device_id=device_id)


@router.post("/register-by-admin", response_model=DeviceRegisterResponse)
async def register_device_by_admin(
    data: DeviceRegisterRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """CMS 관리자용: 인증코드 없이 디바이스 등록 (테스트/스크립트용)"""
    device_id = str(uuid.uuid4())
    device = Device(
        device_id=device_id,
        name=data.name or "Device",
        location=data.location or "",
        group_id=data.group_id,
        registered_at=datetime.utcnow(),
    )
    db.add(device)
    await db.flush()
    await db.refresh(device)
    broadcast_device_list_updated()
    return DeviceRegisterResponse(device_id=device_id)


@router.get("", response_model=list[DeviceListItem])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """디바이스 전체 목록. registered_at 이 NULL이어도 표시(기존 DB 행이 보이도록)."""
    result = await db.execute(select(Device).order_by(Device.id))
    devices = result.scalars().all()
    return [
        DeviceListItem(
            id=d.id,
            device_id=d.device_id,
            name=d.name,
            location=d.location,
            group_id=d.group_id,
            status=d.status,
            last_seen=d.last_seen.isoformat() if d.last_seen else None,
        )
        for d in devices
    ]


async def _sse_generator(request: Request):
    import asyncio
    q = subscribe()
    try:
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=25)
                yield f"data: {msg}\n\n"
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        unsubscribe(q)


@router.get("/events")
async def devices_sse_events(request: Request):
    """SSE: 디바이스 등록/수정 시 CMS가 구독하여 목록 갱신"""
    return StreamingResponse(
        _sse_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/groups", response_model=list[dict])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(DeviceGroup).order_by(DeviceGroup.id))
    groups = result.scalars().all()
    return [{"id": g.id, "name": g.name} for g in groups]


class CreateGroupRequest(BaseModel):
    name: str


@router.post("/groups", response_model=dict)
async def create_group(
    data: CreateGroupRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = DeviceGroup(name=data.name.strip() or "새 그룹")
    db.add(group)
    await db.flush()
    await db.refresh(group)
    return {"id": group.id, "name": group.name}


class UpdateGroupRequest(BaseModel):
    name: str


@router.patch("/groups/{id}", response_model=dict)
async def update_group(
    id: int,
    data: UpdateGroupRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(DeviceGroup).where(DeviceGroup.id == id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    group.name = data.name.strip() or group.name
    await db.flush()
    await db.refresh(group)
    return {"id": group.id, "name": group.name}


@router.delete("/groups/{id}", status_code=204)
async def delete_group(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(DeviceGroup).where(DeviceGroup.id == id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    # 소속 디바이스는 그룹 해제 후 삭제
    result = await db.execute(select(Device).where(Device.group_id == id))
    for device in result.scalars().all():
        device.group_id = None
    await db.delete(group)
    await db.flush()


class LiveScreenRequestResponse(BaseModel):
    ticket: str


class LiveScreenStatusResponse(BaseModel):
    pending: bool
    ticket: Optional[str] = None
    last_ticket: Optional[str] = None
    image_url: Optional[str] = None
    captured_at: Optional[str] = None


@router.post("/{id}/live-screen/request", response_model=LiveScreenRequestResponse)
async def request_device_live_screen(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """CMS: 해당 기기 플레이어에 화면 캡처 요청(티켓 발급)."""
    result = await db.execute(select(Device).where(Device.id == id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    ticket = str(uuid.uuid4())
    device.live_screen_ticket = ticket
    device.live_screen_pending = True
    await db.commit()
    return LiveScreenRequestResponse(ticket=ticket)


@router.get("/{id}/live-screen/status", response_model=LiveScreenStatusResponse)
async def device_live_screen_status(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """CMS: 캡처 완료 여부·이미지 URL 조회."""
    result = await db.execute(select(Device).where(Device.id == id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    image_url = f"/uploads/{device.live_screen_path}" if device.live_screen_path else None
    return LiveScreenStatusResponse(
        pending=device.live_screen_pending,
        ticket=device.live_screen_ticket,
        last_ticket=device.live_screen_last_ticket,
        image_url=image_url,
        captured_at=device.live_screen_at.isoformat() if device.live_screen_at else None,
    )


class UpdateDeviceRequest(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    group_id: Optional[int] = None


@router.patch("/{id}", response_model=DeviceListItem)
async def update_device(
    id: int,
    data: UpdateDeviceRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Device).where(Device.id == id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if data.name is not None:
        device.name = data.name
    if data.location is not None:
        device.location = data.location
    if data.group_id is not None:
        device.group_id = data.group_id if data.group_id else None
    await db.flush()
    await db.refresh(device)
    await db.commit()
    broadcast_device_list_updated()
    broadcast_schedule_updated()  # 그룹 변경 시 플레이어가 새 스케줄 받도록
    return DeviceListItem(
        id=device.id,
        device_id=device.device_id,
        name=device.name,
        location=device.location,
        group_id=device.group_id,
        status=device.status,
        last_seen=device.last_seen.isoformat() if device.last_seen else None,
    )


@router.delete("/{id}", status_code=204)
async def delete_device(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Device).where(Device.id == id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    # 재생 이벤트(playback_events)가 참조하므로 먼저 삭제
    await db.execute(delete(PlaybackEvent).where(PlaybackEvent.device_id == id))
    await db.delete(device)
    await db.flush()
    broadcast_device_list_updated()
