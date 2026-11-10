"""DID/TOX3용 동영상 최적화: 업로드 시 H.264 720p·faststart·무음 MP4로 변환."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# TOX3 등 저사양 사이니지: 1080p 고비트레이트보다 720p가 안정적
MAX_HEIGHT = 720
FFMPEG_TIMEOUT_SEC = 600


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def optimize_video_bytes(body: bytes, ext: str) -> Tuple[bytes, str]:
    """
    동영상을 TOX3 재생용 MP4로 변환.
    ffmpeg 없거나 실패하면 원본 (body, ext) 반환.
    """
    e = (ext or "").lower()
    if e not in {".mp4", ".webm", ".ogg", ".mov", ".m4v"}:
        return body, e if e else ".mp4"
    if not body:
        return body, e
    if not ffmpeg_available():
        logger.warning("ffmpeg not found — video upload stored without TOX3 optimize")
        return body, e

    in_path = None
    out_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=e, delete=False) as fin:
            fin.write(body)
            in_path = fin.name
        out_fd, out_path = tempfile.mkstemp(suffix=".mp4")
        os.close(out_fd)

        # scale: 긴 변 기준으로 720p 이하, 짝수 해상도, yuv420p, 무음, faststart
        vf = (
            f"scale=-2:'min({MAX_HEIGHT},ih)':force_original_aspect_ratio=decrease,"
            "scale=trunc(iw/2)*2:trunc(ih/2)*2"
        )
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            in_path,
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-profile:v",
            "main",
            "-level",
            "4.0",
            "-pix_fmt",
            "yuv420p",
            "-an",  # 플레이어 muted — 오디오 제거로 용량·디코드 부담 감소
            "-movflags",
            "+faststart",
            "-f",
            "mp4",
            out_path,
        ]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=FFMPEG_TIMEOUT_SEC,
            check=False,
        )
        if proc.returncode != 0:
            err = (proc.stderr or b"").decode("utf-8", errors="replace")[-800:]
            logger.warning("ffmpeg optimize failed: %s", err)
            return body, e
        with open(out_path, "rb") as f:
            out = f.read()
        if not out or len(out) < 32:
            return body, e
        # 변환 결과가 원본보다 많이 크면 원본 유지(이미 잘 압축된 경우)
        if len(out) > len(body) * 1.15 and e == ".mp4":
            return body, e
        return out, ".mp4"
    except subprocess.TimeoutExpired:
        logger.warning("ffmpeg optimize timed out")
        return body, e
    except Exception as ex:
        logger.warning("ffmpeg optimize error: %s", ex)
        return body, e
    finally:
        for p in (in_path, out_path):
            if p and os.path.isfile(p):
                try:
                    os.remove(p)
                except OSError:
                    pass


def optimize_video_bytes_safe(body: bytes, ext: str) -> Tuple[bytes, str]:
    """업로드 경로용 래퍼."""
    try:
        return optimize_video_bytes(body, ext)
    except Exception:
        return body, ext
