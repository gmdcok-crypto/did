/**
 * img/video 의 crossOrigin 속성.
 *
 * 예전에는 캔버스(live screen) 캡처용으로 다른 출처에 `anonymous` 를 붙였는데,
 * Cloudflare R2 `pub-*.r2.dev` 등은 **CORS 헤더가 없는 경우가 많아** 그렇게 하면
 * 브라우저가 이미지/영상 GET 자체를 막음(CORS로 표시 실패).
 *
 * **표시**는 crossOrigin 없이도 동작함. 캡처는 크로스오리진에서 제한될 수 있음(R2 버킷 CORS 설정 또는 /uploads 동일 출처).
 */
export function crossOriginForMediaUrl(_url) {
  return undefined
}
