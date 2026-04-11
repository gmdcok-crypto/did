/**
 * 플레이어 .player-zones 영역을 JPEG Blob으로 캡처 (video/img). iframe·크로스오리진 제한 시 영역 스킵.
 * R2 등 외부 URL은 CORS 없이 표시하도록 crossOrigin 을 쓰지 않음 → canvas drawImage 가 막힐 수 있음(캡처만 제한).
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
  const t = text.length > 120 ? `${text.slice(0, 120)}…` : text
  ctx.fillText(t, 24, 180)
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
    ctx.font = `${Math.max(11, 13 * scale)}px system-ui, sans-serif`
    const msg = '미디어 캡처 불가(CORS·로딩). 미디어를 플레이어와 같은 도메인으로 두거나 crossOrigin을 확인하세요.'
    ctx.fillText(msg.slice(0, Math.min(48, msg.length)), 12 * scale, Math.max(24, h * 0.5))
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92)
  })
}
