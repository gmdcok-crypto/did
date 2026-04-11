/**
 * img/video 의 crossOrigin.
 * 외부 미디어(R2 등)는 CORS 헤더가 없는 경우가 많아 crossOrigin 을 붙이지 않음 → 재생 우선.
 * (화면 캡처는 사용하지 않음 — liveStreamPlaceholder.js 참고.)
 */
export function crossOriginForMediaUrl(_url) {
  return undefined
}
