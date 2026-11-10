"""DID/TOX3용 동영상 최적화: 업로드 시 H.264 720p·저비트레이트·faststart·무음 MP4로 변환."""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# TOX3: 720p/2Mbps도 남는 끊김이 있어 한 단계 더 낮춤
MAX_HEIGHT = 540
TARGET_MAXRATE = "1200k"
TARGET_BUFSIZE = "2400k"
TARGET_FPS = "24"
FFMPEG_TIMEOUT_SEC = 900


class VideoOptimizeError(Exception):
    """변환 실패 — 원본을 그대로 올리면 TOX3에서 끊김."""


@dataclass
class VideoOptimizeResult:
    body: bytes
    ext: str
    width: Optional[int] = None
    height: Optional[int] = None
    duration_sec: Optional[float] = None


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _probe_video(path: str) -> tuple[Optional[int], Optional[int], Optional[float]]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None, None, None
    try:
        proc = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height:format=duration",
                "-of",
                "default=noprint_wrappers=1",
                path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if proc.returncode != 0:
            return None, None, None
        width = height = None
        duration = None
        for line in (proc.stdout or "").splitlines():
            if line.startswith("width="):
                width = int(line.split("=", 1)[1])
            elif line.startswith("height="):
                height = int(line.split("=", 1)[1])
            elif line.startswith("duration="):
                try:
                    duration = float(line.split("=", 1)[1])
                except ValueError:
                    duration = None
        return width, height, duration
    except Exception:
        return None, None, None


def optimize_video_bytes(body: bytes, ext: str) -> VideoOptimizeResult:
    """동영상을 TOX3 재생용 MP4로 변환. 실패 시 예외."""
    e = (ext or "").lower()
    if e not in {".mp4", ".webm", ".ogg", ".mov", ".m4v"}:
        raise VideoOptimizeError(f"지원하지 않는 동영상 확장자: {e}")
    if not body:
        raise VideoOptimizeError("빈 동영상 파일입니다.")
    if not ffmpeg_available():
        raise VideoOptimizeError(
            "서버에 ffmpeg가 없어 동영상을 TOX3용으로 변환할 수 없습니다. Railway 재배포(ffmpeg 포함 이미지)를 확인하세요."
        )

    in_path = None
    out_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=e, delete=False) as fin:
            fin.write(body)
            in_path = fin.name
        out_fd, out_path = tempfile.mkstemp(suffix=".mp4")
        os.close(out_fd)

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
            "26",
            "-maxrate",
            TARGET_MAXRATE,
            "-bufsize",
            TARGET_BUFSIZE,
            "-profile:v",
            "baseline",
            "-level",
            "3.0",
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
            raise VideoOptimizeError(
                "동영상 TOX3 최적화(ffmpeg)에 실패했습니다. 파일이 너무 크면 더 짧게 잘라 다시 올려보세요."
            )

        with open(out_path, "rb") as f:
            out = f.read()
        if not out or len(out) < 32:
            raise VideoOptimizeError("변환 결과 파일이 비어 있습니다.")

        width, height, duration = _probe_video(out_path)
        if height is not None and height > MAX_HEIGHT + 2:
            raise VideoOptimizeError(
                f"변환 후에도 해상도가 너무 큽니다({height}p). 업로드를 중단합니다."
            )

        # 원본이 이미 작은데 변환이 이상하게 커진 경우만 차단(4K 원본 통과 금지)
        if len(out) > len(body) and len(body) > 40 * 1024 * 1024:
            raise VideoOptimizeError("변환 결과가 원본보다 큽니다. 변환을 중단합니다.")

        logger.info(
            "video optimized: in=%sKB out=%sKB %sx%s",
            len(body) // 1024,
            len(out) // 1024,
            width,
            height,
        )
        return VideoOptimizeResult(
            body=out,
            ext=".mp4",
            width=width,
            height=height,
            duration_sec=duration,
        )
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


def optimize_video_bytes_safe(body: bytes, ext: str) -> VideoOptimizeResult:
    return optimize_video_bytes(body, ext)
