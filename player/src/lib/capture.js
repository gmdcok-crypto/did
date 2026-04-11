/**
 * 플레이어 .player-zones 영역을 JPEG Blob으로 캡처 (video/img). iframe·크로스오리진 제한 시 영역 스킵.
 * crossOrigin 미설정 시 다른 출처 비디오는 canvas drawImage 가 막혀 검은 화면만 나올 수 있음 → mediaCrossOrigin.js 와 함께 사용.
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
