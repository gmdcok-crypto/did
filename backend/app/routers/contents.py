from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional
import os
import uuid
from app.database import get_db
from app.models import Content, User, CampaignContent, PlaybackEvent
from app.deps import get_current_user
from app.config import get_settings

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
    name: str

    class Config:
        from_attributes = True


class UploadResponse(BaseModel):
    url: str
    filename: str


ALLOWED_EXTENSIONS = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"},
    "video": {".mp4", ".webm", ".ogg", ".mov"},
    "html": {".html", ".htm"},
}


@router.post("/upload", response_model=UploadResponse)
async def upload_content_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """파일을 업로드하고 접근 URL을 반환합니다. 반환된 URL을 미디어 등록 시 사용하세요."""
    settings = get_settings()
    ext = os.path.splitext(file.filename or "")[-1].lower()
    if not ext or ext not in {e for s in ALLOWED_EXTENSIONS.values() for e in s}:
        raise HTTPException(
            status_code=400,
            detail="허용 확장자: 이미지(jpg,png,gif,webp,svg), 동영상(mp4,webm,ogg,mov), HTML(html,htm)",
        )
    safe_name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.upload_dir, safe_name)
    try:
        content = await file.read()
        with open(path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파일 저장 실패: {e}")
    # 경로만 저장 → IPv6(localhost→::1) 등 호스트 불일치 방지, 플레이어는 같은 origin + /uploads 로 요청
    url = f"/uploads/{safe_name}"
    return UploadResponse(url=url, filename=safe_name)


@router.get("", response_model=list[ContentItem])
async def list_contents(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Content).order_by(Content.id.desc()))
    return result.scalars().all()


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
    # FK 참조 제거: 캠페인 소속·재생 이벤트 먼저 삭제
    await db.execute(delete(PlaybackEvent).where(PlaybackEvent.content_id == id))
    await db.execute(delete(CampaignContent).where(CampaignContent.content_id == id))
    await db.delete(c)
    await db.flush()
