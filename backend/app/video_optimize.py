"""DID/TOX3용 동영상 최적화: 업로드 시 H.264 720p·저비트레이트·faststart·무음 MP4로 변환."""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
from typing import Tuple

logger = logging.getLogger(__name__)

# 잘 재생되던 medium 샘플(~2Mbps/720p)에 맞춘 상한
MAX_HEIGHT = 720
TARGET_MAXRATE = "2500k"
TARGET_BUFSIZE = "5000k"
TARGET_FPS = "30"
FFMPEG_TIMEOUT_SEC = 900


class VideoOptimizeError(Exception):
    """변환 실패 — 원본을 그대로 올리면 TOX3에서 끊김."""


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _probe_height(path: str) -> int | None:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    try:
        proc = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=height",
                "-of",
                "csv=p=0",
                path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if proc.returncode != 0:
            return None
        m = re.search(r"(\d+)", (proc.stdout or "").strip())
        return int(m.group(1)) if m else None
    except Exception:
        return None


def optimize_video_bytes(body: bytes, ext: str) -> Tuple[bytes, str]:
    """
    동영상을 TOX3 재생용 MP4로 변환.
    실패 시 원본을 반환하지 않고 VideoOptimizeError 발생.
    """
    e = (ext or "").lower()
    if e not in {".mp4", ".webm", ".ogg", ".mov", ".m4v"}:
        raise VideoOptimizeError(f"지원하지 않는 동영상 확장자: {e}")
    if not body:
        raise VideoOptimizeError("빈 동영상 파일입니다.")
    if not ffmpeg_available():
        raise VideoOptimizeError(
            "서버에 ffmpeg가 없어 동영상을 TOX3용으로 변환할 수 없습니다. 배포 이미지를 확인하세요."
        )

    in_path = None
    out_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=e, delete=False) as fin:
            fin.write(body)
            in_path = fin.name
        out_fd, out_path = tempfile.mkstemp(suffix=".mp4")
        os.close(out_fd)

        # 4K 등도 강제 720p 이하 + 비트레이트 상한(잘 되던 ~2Mbps급)
        vf = (
            f"scale=-2:'min({MAX_HEIGHT},ih)':force_original_aspect_ratio=decrease,"
            "scale=trunc(iw/2)*2:trunc(ih/2)*2,"
            f"fps={TARGET_FPS}"
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
            "-maxrate",
            TARGET_MAXRATE,
            "-bufsize",
            TARGET_BUFSIZE,
            "-profile:v",
            "main",
            "-level",
            "4.0",
            "-pix_fmt",
            "yuv420p",
            "-an",
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
            err = (proc.stderr or b"").decode("utf-8", errors="replace")[-1000:]
            logger.error("ffmpeg optimize failed: %s", err)
            raise VideoOptimizeError("동영상 TOX3 최적화(ffmpeg)에 실패했습니다. 다른 파일로 다시 시도하세요.")

        with open(out_path, "rb") as f:
            out = f.read()
        if not out or len(out) < 32:
            raise VideoOptimizeError("변환 결과 파일이 비어 있습니다.")

        height = _probe_height(out_path)
        if height is not None and height > MAX_HEIGHT + 2:
            raise VideoOptimizeError(
                f"변환 후에도 해상도가 너무 큽니다({height}p). 업로드를 중단합니다."
            )

        logger.info(
            "video optimized: in=%sKB out=%sKB height=%s",
            len(body) // 1024,
            len(out) // 1024,
            height,
        )
        return out, ".mp4"
    except VideoOptimizeError:
        raise
    except subprocess.TimeoutExpired as ex:
        raise VideoOptimizeError("동영상 변환 시간이 초과되었습니다. 더 짧은 클립으로 올려주세요.") from ex
    except Exception as ex:
        raise VideoOptimizeError(f"동영상 변환 오류: {ex}") from ex
    finally:
        for p in (in_path, out_path):
            if p and os.path.isfile(p):
                try:
                    os.remove(p)
                except OSError:
                    pass


def optimize_video_bytes_safe(body: bytes, ext: str) -> Tuple[bytes, str]:
    """업로드 경로용 — 실패 시 예외를 그대로 전달(원본 저장 금지)."""
    return optimize_video_bytes(body, ext)
