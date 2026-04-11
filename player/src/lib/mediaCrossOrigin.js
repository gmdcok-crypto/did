/**
 * img/video 의 crossOrigin 속성.
 *
 * - **동일 출처**(플레이어 페이지와 같은 origin)인 미디어는 속성 없이도 캔버스(live screen) 캡처에 쓸 수 있음.
 * - **다른 출처**에 `anonymous` 를 붙이면 CORS 헤더가 맞을 때만 표시+캡처 모두 가능.
 * - Cloudflare R2 등 **CORS 없는** 외부 URL에 `anonymous` 를 강제하면 브라우저가 GET 자체를 막을 수 있어,
 *   기본값은 `undefined` 이고, **버킷에 CORS를 설정한 호스트만** 환경변수로 지정한다.
 *
 * @see VITE_MEDIA_CROSSORIGIN_HOSTS — 쉼표로 구분한 호스트명(정확히 일치). 예: pub-xxx.r2.dev,cdn.example.com
 */
export function crossOriginForMediaUrl(url) {
  if (!url || typeof window === 'undefined') return undefined
  let u
  try {
    u = new URL(url, window.location.href)
  } catch {
    return undefined
  }
  if (u.origin === window.location.origin) {
    return undefined
  }
  const raw = import.meta.env.VITE_MEDIA_CROSSORIGIN_HOSTS
  if (!raw || !String(raw).trim()) return undefined
  const allowed = String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const host = u.hostname.toLowerCase()
  if (allowed.some((h) => host === h)) {
    return 'anonymous'
  }
  return undefined
}
