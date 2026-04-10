/**
 * 플레이어 .player-zones 영역을 JPEG Blob으로 캡처 (video/img). iframe·크로스오리진 이미지는 제한될 수 있음.
 */
export function capturePlayerZones(rootEl) {
  return new Promise((resolve) => {
    if (!rootEl || rootEl.clientWidth < 2 || rootEl.clientHeight < 2) {
      resolve(null)
      return
    }
    const scale = Math.min(1, 1280 / rootEl.clientWidth)
    const w = Math.max(1, Math.floor(rootEl.clientWidth * scale))
    const h = Math.max(1, Math.floor(rootEl.clientHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      resolve(null)
      return
    }
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, w, h)
    const rootRect = rootEl.getBoundingClientRect()
    const wraps = rootEl.querySelectorAll('.media-wrap:not(.media-wrap-prev)')
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
        if (v && v.readyState >= 2) {
          ctx.drawImage(v, dx, dy, dw, dh)
        } else if (img && img.complete && img.naturalWidth) {
          ctx.drawImage(img, dx, dy, dw, dh)
        } else if (iframe) {
          ctx.fillStyle = '#2a2a2e'
          ctx.fillRect(dx, dy, dw, dh)
          ctx.fillStyle = '#71717a'
          ctx.font = `${Math.max(12, 14 * scale)}px system-ui, sans-serif`
          ctx.fillText('HTML', dx + 8 * scale, dy + 22 * scale)
        }
      } catch {
        /* CORS 등으로 drawImage 실패 시 해당 영역 스킵 */
      }
    }
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85)
  })
}
