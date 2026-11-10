"""DID/사이니지용 이미지 최적화: 업로드 시 해상도·용량을 줄여 TOX3 로딩을 빠르게."""

from __future__ import annotations

import io
from typing import Tuple

# Full HD 사이니지 기준. 긴 변 1920 이하면 리사이즈만 스킵(압축은 가능)
MAX_EDGE_PX = 1920
JPEG_QUALITY = 82
WEBP_QUALITY = 80


def optimize_image_bytes(body: bytes, ext: str) -> Tuple[bytes, str]:
    """
    이미지 바이트를 표시용으로 줄인다.
    Returns (bytes, ext) — 포맷이 바뀌면 ext도 바뀜(예: .png → .jpg).
    SVG/GIF(애니메이션 가능)은 원본 유지.
    """
    e = (ext or "").lower()
    if e not in {".jpg", ".jpeg", ".png", ".webp"}:
        return body, e if e else ".jpg"

    try:
        from PIL import Image, ImageOps
    except ImportError:
        return body, e

    try:
        im = Image.open(io.BytesIO(body))
        im = ImageOps.exif_transpose(im)
    except Exception:
        return body, e

    # 너무 큰 원본만 축소
    w, h = im.size
    longest = max(w, h)
    if longest > MAX_EDGE_PX:
        scale = MAX_EDGE_PX / float(longest)
        nw = max(1, int(round(w * scale)))
        nh = max(1, int(round(h * scale)))
        im = im.resize((nw, nh), Image.Resampling.LANCZOS)

    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)

    out = io.BytesIO()
    # 사진형 PNG는 JPEG로 바꿔 용량을 크게 줄임 (투명 있으면 WebP/PNG 유지)
    if e in {".jpg", ".jpeg"} or (e == ".png" and not has_alpha):
        if im.mode != "RGB":
            im = im.convert("RGB")
        im.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
        data = out.getvalue()
        # 원본보다 커지면 원본 유지
        if len(data) >= len(body) and longest <= MAX_EDGE_PX and e in {".jpg", ".jpeg"}:
            return body, e
        return data, ".jpg"

    if e == ".webp" or (e == ".png" and has_alpha):
        if has_alpha and im.mode not in ("RGBA", "RGB"):
            im = im.convert("RGBA")
        elif not has_alpha and im.mode != "RGB":
            im = im.convert("RGB")
        im.save(out, format="WEBP", quality=WEBP_QUALITY, method=4)
        data = out.getvalue()
        if len(data) >= len(body) and longest <= MAX_EDGE_PX:
            return body, e
        return data, ".webp"

    return body, e
