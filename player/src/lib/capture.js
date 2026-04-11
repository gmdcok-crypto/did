/**
 * 플레이어 .player-zones 영역을 JPEG Blob으로 캡처 (video/img). iframe·크로스오리진 제한 시 영역 스킵.
 * 동일 출처(/uploads 등)는 캡처 가능. 외부 URL은 mediaCrossOrigin.js·VITE_MEDIA_CROSSORIGIN_HOSTS 참고.
 */
function waitNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })
}

function waitVideoReady(videoEl, ms) {
  if (!videoEl || videoEl.readyState >= 2) return Promise.resolve()
  return Promise.race([
    new Promise((resolve) => {
      videoEl.addEventListener('loadeddata', () => resolve(), { once: true })
      videoEl.addEventListener('canplay', () => resolve(), { once: true })
    }),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ])
}

function waitVideoFrame(videoEl) {
  return new Promise((resolve) => {
    if (!videoEl) {
      resolve()
      return
    }
    if (typeof videoEl.requestVideoFrameCallback === 'function') {
      videoEl.requestVideoFrameCallback(() => resolve())
    } else {
      requestAnimationFrame(resolve)
    }
  })
}

/** canvas fillText는 줄바꿈 없음 — CORS 안내 등 긴 문장을 박스 안에 여러 줄로 표시 */
function fillTextWrapped(ctx, text, x, startY, maxWidth, lineHeight, maxLines = 14) {
  const t = String(text)
  let line = ''
  let yy = startY
  let count = 0
  for (const ch of [...t]) {
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy)
      count++
      if (count >= maxLines) return
      line = ch
      yy += lineHeight
    } else {
      line = test
    }
  }
  if (!line) return
  if (ctx.measureText(line).width <= maxWidth) {
    ctx.fillText(line, x, yy)
    return
  }
  let s = line
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) {
    s = s.slice(0, -1)
  }
  ctx.fillText(`${s}…`, x, yy)
}

/**
 * CMS 실시간 화면용: ref 미연결·레이아웃 0 등으로 zonesRef 가 비어 있을 때 DOM에서 후보 탐색.
 */
export function resolveLiveCaptureRoot(zonesRef) {
  if (typeof document === 'undefined') return null
  const candidates = [
    zonesRef?.current,
    document.querySelector('.player-zones'),
    document.getElementById('root'),
    document.body,
  ]
  for (const el of candidates) {
    if (el && el.clientWidth >= 2 && el.clientHeight >= 2) return el
  }
  return null
}

/** 캡처 실패 시에도 업로드해 CMS가 무한 대기하지 않도록 */
export function capturePlaceholderBlob(text = '화면 캡처 불가 · 플레이어 표시 확인') {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 360
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.fillStyle = '#161618'
  ctx.fillRect(0, 0, 640, 360)
  ctx.fillStyle = '#a1a1aa'
  ctx.font = '16px system-ui,sans-serif'
  const t = text.length > 400 ? `${text.slice(0, 400)}…` : text
  fillTextWrapped(ctx, t, 24, 48, 640 - 48, 22, 12)
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82)
  })
}

export async function capturePlayerZones(rootEl) {
  if (!rootEl || rootEl.clientWidth < 2 || rootEl.clientHeight < 2) {
    return null
  }
  await waitNextPaint()
  const wraps = rootEl.querySelectorAll('.media-wrap:not(.media-wrap-prev)')
  for (const wrap of wraps) {
    const v = wrap.querySelector('video')
    if (v) {
      await waitVideoReady(v, 1200)
      await waitVideoFrame(v)
    }
  }

  const scale = Math.min(1, 1280 / rootEl.clientWidth)
  const w = Math.max(1, Math.floor(rootEl.clientWidth * scale))
  const h = Math.max(1, Math.floor(rootEl.clientHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return null
  }
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, w, h)
  const rootRect = rootEl.getBoundingClientRect()
  let drewMedia = false
  for (const wrap of wraps) {
    const r = wrap.getBoundingClientRect()
    const dx = (r.left - rootRect.left) * scale
    const dy = (r.top - rootRect.top) * scale
    const dw = Math.max(1, r.width * scale)
    const dh = Math.max(1, r.height * scale)
    const v = wrap.querySelector('video')
    const img = wrap.querySelector('img')
    const iframe = wrap.querySelector('iframe')
    try {
      if (v) {
        await waitVideoFrame(v)
        if (v.readyState >= 2) {
          ctx.drawImage(v, dx, dy, dw, dh)
          drewMedia = true
        } else if (v.readyState >= 1) {
          try {
            ctx.drawImage(v, dx, dy, dw, dh)
            drewMedia = true
          } catch {
            ctx.fillStyle = '#1a1a1c'
            ctx.fillRect(dx, dy, dw, dh)
          }
        }
      } else if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, dx, dy, dw, dh)
        drewMedia = true
      } else if (iframe) {
        ctx.fillStyle = '#2a2a2e'
        ctx.fillRect(dx, dy, dw, dh)
        ctx.fillStyle = '#71717a'
        ctx.font = `${Math.max(12, 14 * scale)}px system-ui, sans-serif`
        ctx.fillText('HTML', dx + 8 * scale, dy + 22 * scale)
        drewMedia = true
      }
    } catch {
      /* CORS 등으로 drawImage 실패 */
    }
  }
  if (!drewMedia && wraps.length > 0) {
    ctx.fillStyle = '#a1a1aa'
    const fontSize = Math.max(11, 13 * scale)
    ctx.font = `${fontSize}px system-ui, sans-serif`
    const pad = 12 * scale
    const msg =
      '미디어 캡처 불가(CORS·로딩). /uploads 등 플레이어와 같은 도메인에 두는 것을 권장합니다. 외부 저장소(R2 등)는 버킷 CORS를 연 뒤 플레이어 빌드에 VITE_MEDIA_CROSSORIGIN_HOSTS=호스트명 을 설정하세요.'
    const maxW = Math.max(80, w - pad * 2)
    const lineHeight = fontSize * 1.38
    fillTextWrapped(ctx, msg, pad, Math.max(fontSize * 1.5, h * 0.32), maxW, lineHeight, 10)
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92)
  })
}
