/**
 * CMS 실시간 스트림: 화면/미디어 캡처 없이 고정 안내 이미지(JPEG)만 생성해 전송.
 * 외부 저장소(R2 등) CORS·캔버스 이슈와 무관하게 동작.
 */
function fillTextWrapped(ctx, text, x, startY, maxWidth, lineHeight, maxLines = 10) {
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
  if (line) ctx.fillText(line, x, yy)
}

export function liveStreamPlaceholderBlob(
  text = '실시간 연결됨 · 재생 화면 캡처는 사용하지 않습니다. 외부 미디어 저장소와 무관하게 스트림만 확인합니다.',
) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 360
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.fillStyle = '#161618'
  ctx.fillRect(0, 0, 640, 360)
  ctx.fillStyle = '#a1a1aa'
  ctx.font = '16px system-ui,sans-serif'
  fillTextWrapped(ctx, text, 24, 48, 640 - 48, 22, 12)
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82)
  })
}
