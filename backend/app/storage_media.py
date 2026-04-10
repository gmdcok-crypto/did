"""미디어 파일 저장: Cloudflare R2(S3 호환) 또는 로컬 uploads."""

from __future__ import annotations

import mimetypes
import os
import uuid
from typing import TYPE_CHECKING, Optional
from urllib.parse import urlparse

if TYPE_CHECKING:
    from app.config import Settings

# contents.py와 동일한 확장자 집합
ALLOWED_EXTENSIONS = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"},
    "video": {".mp4", ".webm", ".ogg", ".mov"},
    "html": {".html", ".htm"},
}


def ext_to_media_kind(ext: str) -> str:
    e = ext.lower()
    for kind, exts in ALLOWED_EXTENSIONS.items():
        if e in exts:
            return kind
    return "image"


def repoint_legacy_r2_public_url(url: str, new_base: str) -> Optional[str]:
    """
    DB에 예전 pub-xxx.r2.dev 가 박혀 있고 R2_PUBLIC_BASE_URL 만 바뀐 경우,
    같은 객체 경로(/media/...)를 현재 공개 베이스로 맞춘 전체 URL을 반환. 바꿀 필요 없으면 None.
    """
    nb = (new_base or "").strip().rstrip("/")
    if not nb or not (url or "").strip():
        return None
    u = url.strip()
    try:
        p = urlparse(u)
    except Exception:
        return None
    if p.scheme not in ("http", "https"):
        return None
    if not p.netloc.endswith(".r2.dev"):
        return None
    if not p.path.startswith("/media/"):
        return None
    origin = f"{p.scheme}://{p.netloc}".rstrip("/")
    if origin == nb:
        return None
    tail = p.path + (("?" + p.query) if p.query else "")
    new_url = nb + tail
    return new_url if new_url != u else None


def r2_enabled(settings: Settings) -> bool:
    """R2 필수 값이 있으면 R2만 사용."""
    return bool(
        (settings.r2_account_id or "").strip()
        and (settings.r2_access_key_id or "").strip()
        and (settings.r2_secret_access_key or "").strip()
        and (settings.r2_public_base_url or "").strip()
    )


def _guess_content_type(ext: str) -> str:
    e = ext.lower()
    guess, _ = mimetypes.guess_type(f"x{e}")
    if guess:
        return guess
    if e in {".mp4"}:
        return "video/mp4"
    if e in {".webm"}:
        return "video/webm"
    if e in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if e in {".png"}:
        return "image/png"
    if e in {".html", ".htm"}:
        return "text/html"
    return "application/octet-stream"


def _r2_client(settings: Settings):
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=f"https://{(settings.r2_account_id or '').strip()}.r2.cloudflarestorage.com",
        aws_access_key_id=(settings.r2_access_key_id or "").strip(),
        aws_secret_access_key=(settings.r2_secret_access_key or "").strip(),
        region_name="auto",
    )


def upload_media_bytes(
    settings: Settings,
    body: bytes,
    ext: str,
) -> tuple[str, str]:
    """
    Returns (public_url, storage_key).
    storage_key: R2 object key 또는 로컬 상대 경로(media/...).
    """
    kind = ext_to_media_kind(ext)
    safe = f"{uuid.uuid4().hex}{ext.lower()}"

    if r2_enabled(settings):
        key = f"media/{kind}/{safe}"
        client = _r2_client(settings)
        bucket = (settings.r2_bucket or "did").strip() or "did"
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=body,
            ContentType=_guess_content_type(ext),
        )
        base = (settings.r2_public_base_url or "").strip().rstrip("/")
        url = f"{base}/{key}"
        return url, key

    # 로컬: upload_dir/media/{kind}/{file}
    os.makedirs(os.path.join(settings.upload_dir, "media", kind), exist_ok=True)
    rel = f"media/{kind}/{safe}"
    path = os.path.join(settings.upload_dir, rel)
    with open(path, "wb") as f:
        f.write(body)
    url = f"/uploads/{rel}"
    return url, rel


def delete_media_if_managed(settings: Settings, url: str) -> None:
    """콘텐츠 삭제 시 R2 객체 또는 로컬 파일 제거."""
    if not url or not url.strip():
        return
    url = url.strip()
    if r2_enabled(settings):
        base = (settings.r2_public_base_url or "").strip().rstrip("/")
        if base and url.startswith(base):
            key = url[len(base) :].lstrip("/")
            if key:
                try:
                    client = _r2_client(settings)
                    bucket = (settings.r2_bucket or "did").strip() or "did"
                    client.delete_object(Bucket=bucket, Key=key)
                except Exception:
                    pass
        return
    # 로컬
    if url.startswith("/uploads/"):
        rel = url[len("/uploads/") :].lstrip("/")
        path = os.path.join(settings.upload_dir, rel)
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError:
            pass
