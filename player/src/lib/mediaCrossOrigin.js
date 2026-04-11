/**
 * 페이지와 다른 출처로 미디어를 불러올 때 캔버스 캡처를 위해 crossOrigin 필요.
 * 같은 출처면 속성 생략(불필요한 CORS 프리플라이트 방지).
 */
export function crossOriginForMediaUrl(url) {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return undefined
  try {
    const abs = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost')
    if (typeof window !== 'undefined' && abs.origin !== window.location.origin) {
      return 'anonymous'
    }
  } catch {
    return undefined
  }
  return undefined
}
