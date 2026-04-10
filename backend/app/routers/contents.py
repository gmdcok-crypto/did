from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional
import os
from app.database import get_db
from app.models import Content, User, CampaignContent, PlaybackEvent
from app.deps import get_current_user, get_current_admin_user
from app.config import get_settings
from app.storage_media import (
    ALLOWED_EXTENSIONS,
    upload_media_bytes,
    delete_media_if_managed,
    repoint_legacy_r2_public_url,
)

router = APIRouter(prefix="/contents", tags=["contents"])


class ContentCreate(BaseModel):
    type: str  # video, image, html
    url: str
    duration_sec: int = 10
    name: str = ""


class ContentUpdate(BaseModel):
    type: Optional[str] = None
    url: Optional[str] = None
    duration_sec: Optional[int] = None
    name: Optional[str] = None


class ContentItem(BaseModel):
    id: int
    type: str
    url: str
    duration_sec: int
    name: Optional[str] = ""  # DB에 NULL일 수 있음

    class Config:
        from_attributes = True


class UploadResponse(BaseModel):
    url: str
    filename: str


class RepointR2UrlItem(BaseModel):
    id: int
    old_url: str
    new_url: str


class RepointR2UrlsResponse(BaseModel):
    updated: int
    items: list[RepointR2UrlItem]


@router.post("/repoint-r2-public-urls", response_model=RepointR2UrlsResponse)
async def repoint_r2_public_urls(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    """
    Railway에서 R2_PUBLIC_BASE_URL 만 바꾼 뒤, 예전 pub-xxx.r2.dev 가 DB에 남아 있을 때
    `media/...` 경로는 유지하고 호스트만 현재 공개 베이스로 맞춥니다. (관리자 전용)
    """
    settings = get_settings()
    new_base = (settings.r2_public_base_url or "").strip().rstrip("/")
    if not new_base:
        raise HTTPException(
            status_code=400,
            detail="R2_PUBLIC_BASE_URL 이 설정되어 있어야 합니다.",
        )
    result = await db.execute(select(Content))
    rows = result.scalars().all()
    items: list[RepointR2UrlItem] = []
    for c in rows:
        if not c.url:
            continue
        new_u = repoint_legacy_r2_public_url(c.url, new_base)
        if new_u is None:
            continue
        old = c.url
        c.url = new_u
        items.append(RepointR2UrlItem(id=c.id, old_url=old, new_url=new_u))
    await db.commit()
    return RepointR2UrlsResponse(updated=len(items), items=items)


@router.post("/upload", response_model=UploadResponse)
async def upload_content_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """파일을 업로드하고 접근 URL을 반환합니다. R2 설정 시 `media/{image|video|html}/` 키로 저장."""
    settings = get_settings()
    ext = os.path.splitext(file.filename or "")[-1].lower()
    if not ext or ext not in {e for s in ALLOWED_EXTENSIONS.values() for e in s}:
        raise HTTPException(
            status_code=400,
            detail="허용 확장자: 이미지(jpg,png,gif,webp,svg), 동영상(mp4,webm,ogg,mov), HTML(html,htm)",
        )
    try:
        content = await file.read()
        url, key = upload_media_bytes(settings, content, ext)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파일 저장 실패: {e}")
    filename = key.split("/")[-1] if "/" in key else key
    return UploadResponse(url=url, filename=filename)


@router.get("", response_model=list[ContentItem])
async def list_contents(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Content).order_by(Content.id.desc()))
    rows = result.scalars().all()
    return [
        ContentItem(
            id=c.id,
            type=c.type or "image",
            url=c.url or "",
            duration_sec=c.duration_sec if c.duration_sec is not None else 10,
            name=c.name if c.name is not None else "",
        )
        for c in rows
    ]


@router.post("", response_model=ContentItem)
async def create_content(
    data: ContentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = Content(
        type=data.type,
        url=data.url,
        duration_sec=data.duration_sec,
        name=data.name or data.url,
    )
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return c


@router.patch("/{id}", response_model=ContentItem)
async def update_content(
    id: int,
    data: ContentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Content).where(Content.id == id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Content not found")
    if data.type is not None:
        c.type = data.type
    if data.url is not None:
        c.url = data.url
    if data.duration_sec is not None:
        c.duration_sec = data.duration_sec
    if data.name is not None:
        c.name = data.name
    await db.flush()
    await db.refresh(c)
    return c


@router.delete("/{id}", status_code=204)
async def delete_content(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Content).where(Content.id == id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Content not found")
    settings = get_settings()
    if c.url:
        delete_media_if_managed(settings, c.url)
    # FK 참조 제거: 캠페인 소속·재생 이벤트 먼저 삭제
    await db.execute(delete(PlaybackEvent).where(PlaybackEvent.content_id == id))
    await db.execute(delete(CampaignContent).where(CampaignContent.content_id == id))
    await db.delete(c)
    await db.flush()
