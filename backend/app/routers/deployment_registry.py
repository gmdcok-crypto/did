"""운영자 전용: 고객별 배포(Railway, MySQL DB명, R2 버킷·공개 URL) 레지스트리. 비밀번호 미저장."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_serializer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.datetime_kst import to_kst_iso
from app.deps import get_current_admin_user
from app.models import DeploymentRecord, User

router = APIRouter(prefix="/deployment-registry", tags=["deployment-registry"])


class DeploymentRecordCreate(BaseModel):
    name: str
    railway_project_label: Optional[str] = None
    public_url: Optional[str] = None
    mysql_database: Optional[str] = None
    r2_bucket: Optional[str] = None
    r2_public_url: Optional[str] = None
    notes: Optional[str] = None
    sort_order: int = 0


class DeploymentRecordUpdate(BaseModel):
    name: Optional[str] = None
    railway_project_label: Optional[str] = None
    public_url: Optional[str] = None
    mysql_database: Optional[str] = None
    r2_bucket: Optional[str] = None
    r2_public_url: Optional[str] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None


class DeploymentRecordItem(BaseModel):
    id: int
    name: str
    railway_project_label: Optional[str] = None
    public_url: Optional[str] = None
    mysql_database: Optional[str] = None
    r2_bucket: Optional[str] = None
    r2_public_url: Optional[str] = None
    notes: Optional[str] = None
    sort_order: int
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at")
    def _ser_kst(self, v: datetime) -> str:
        return to_kst_iso(v) or ""

    class Config:
        from_attributes = True


@router.get("", response_model=list[DeploymentRecordItem])
async def list_records(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    r = await db.execute(select(DeploymentRecord).order_by(DeploymentRecord.sort_order, DeploymentRecord.id))
    return list(r.scalars().all())


@router.post("", response_model=DeploymentRecordItem)
async def create_record(
    data: DeploymentRecordCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="이름은 필수입니다.")
    row = DeploymentRecord(
        name=name,
        railway_project_label=_empty_to_none(data.railway_project_label),
        public_url=_empty_to_none(data.public_url),
        mysql_database=_empty_to_none(data.mysql_database),
        r2_bucket=_empty_to_none(data.r2_bucket),
        r2_public_url=_empty_to_none(data.r2_public_url),
        notes=_empty_to_none(data.notes),
        sort_order=data.sort_order,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


def _empty_to_none(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    t = s.strip()
    return t if t else None


@router.patch("/{record_id}", response_model=DeploymentRecordItem)
async def update_record(
    record_id: int,
    data: DeploymentRecordUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    r = await db.execute(select(DeploymentRecord).where(DeploymentRecord.id == record_id))
    row = r.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다.")
    if data.name is not None:
        nt = data.name.strip()
        if not nt:
            raise HTTPException(status_code=400, detail="이름은 비울 수 없습니다.")
        row.name = nt
    if data.railway_project_label is not None:
        row.railway_project_label = _empty_to_none(data.railway_project_label)
    if data.public_url is not None:
        row.public_url = _empty_to_none(data.public_url)
    if data.mysql_database is not None:
        row.mysql_database = _empty_to_none(data.mysql_database)
    if data.r2_bucket is not None:
        row.r2_bucket = _empty_to_none(data.r2_bucket)
    if data.r2_public_url is not None:
        row.r2_public_url = _empty_to_none(data.r2_public_url)
    if data.notes is not None:
        row.notes = _empty_to_none(data.notes)
    if data.sort_order is not None:
        row.sort_order = data.sort_order
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{record_id}")
async def delete_record(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    r = await db.execute(select(DeploymentRecord).where(DeploymentRecord.id == record_id))
    row = r.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다.")
    await db.delete(row)
    await db.commit()
    return {"ok": True}
