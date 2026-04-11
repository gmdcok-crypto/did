/**
 * img/video 의 crossOrigin.
 * 외부 미디어(R2 등)는 CORS 헤더가 없는 경우가 많아 crossOrigin 을 붙이지 않음 → 재생 우선.
 * (실시간 CMS는 재생 URL 매니페스트 스트림 사용 — 화면 캡처 없음.)
 */
export function crossOriginForMediaUrl(_url) {
  return undefined
}
