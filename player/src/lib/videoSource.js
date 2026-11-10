/**
 * TOX3 등 저사양: 재생 전 전체 다운로드는 시작이 너무 느림 → 즉시 progressive.
 * 캐시 hit 이 있을 때만 blob 로컬 재생. 고사양만 백그라운드 warm 허용.
 */

const VIDEO_CACHE = 'did-video-local-v1'
const MAX_BLOB_BYTES = 80 * 1024 * 1024
const FETCH_TIMEOUT_MS = 60000

function isRemoteMediaUrl(url) {
  if (!url) return false
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.href : undefined)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** TOX3/안드로이드 사인age 등 — 메모리·코어가 빈약하면 true */
export function isLowPowerPlayer() {
  if (typeof navigator === 'undefined') return true
  const mem = Number(navigator.deviceMemory || 0)
  const cores = Number(navigator.hardwareConcurrency || 0)
  const ua = String(navigator.userAgent || '')
  if (mem > 0 && mem <= 2) return true
  if (cores > 0 && cores <= 4) return true
  // 흔한 사인age/TV 웹뷰 힌트
  if (/Android/i.test(ua) && (mem <= 4 || cores <= 6)) return true
  return false
}

async function blobFromCache(url) {
  if (typeof caches === 'undefined') return null
  try {
    const cache = await caches.open(VIDEO_CACHE)
    const hit = await cache.match(url)
    if (!hit) return null
    return await hit.blob()
  } catch {
    return null
  }
}

async function putBlobCache(url, response) {
  if (typeof caches === 'undefined') return
  try {
    const cache = await caches.open(VIDEO_CACHE)
    await cache.put(url, response)
  } catch {
    /* quota 등 무시 */
  }
}

function toObjectUrl(blob) {
  const obj = URL.createObjectURL(blob)
  return {
    src: obj,
    local: true,
    revoke: () => {
      try {
        URL.revokeObjectURL(obj)
      } catch (_) {}
    },
  }
}

/**
 * 즉시 재생용 소스 결정.
 * - 캐시 있으면 blob
 * - 저사양은 원격 URL 즉시 (다운로드 대기 없음)
 * - 고사양만 원격 fetch→blob 시도
 */
export async function resolveVideoPlaySource(remoteUrl, opts = {}) {
  if (!remoteUrl || !isRemoteMediaUrl(remoteUrl)) {
    return { src: remoteUrl || '', local: false }
  }

  const cachedBlob = await blobFromCache(remoteUrl)
  if (cachedBlob && cachedBlob.size > 0) return toObjectUrl(cachedBlob)

  // TOX3: 재생 전 전체 다운로드 금지 — 바로 스트리밍 시작
  if (opts.forceRemote || isLowPowerPlayer() || opts.cacheOnly) {
    return { src: remoteUrl, local: false }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  const onAbort = () => ctrl.abort()
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort()
    else opts.signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const res = await fetch(remoteUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`video fetch ${res.status}`)
    const len = Number(res.headers.get('content-length') || 0)
    if (len > MAX_BLOB_BYTES) throw new Error('video too large for blob')
    const clone = res.clone()
    const blob = await res.blob()
    if (!blob || blob.size <= 0) throw new Error('empty video blob')
    if (blob.size > MAX_BLOB_BYTES) throw new Error('video too large for blob')
    void putBlobCache(remoteUrl, clone)
    return toObjectUrl(blob)
  } catch {
    return { src: remoteUrl, local: false }
  } finally {
    clearTimeout(timer)
    if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
  }
}

/** 재생이 안정된 뒤(고사양만) 다음 루프용 캐시 warm — 저사양은 no-op */
export async function warmVideoCacheInBackground(remoteUrl, opts = {}) {
  if (!remoteUrl || !isRemoteMediaUrl(remoteUrl)) return
  if (isLowPowerPlayer()) return
  const cached = await blobFromCache(remoteUrl)
  if (cached) return

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  const onAbort = () => ctrl.abort()
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort()
    else opts.signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    const res = await fetch(remoteUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      signal: ctrl.signal,
    })
    if (!res.ok) return
    const len = Number(res.headers.get('content-length') || 0)
    if (len > MAX_BLOB_BYTES) return
    await putBlobCache(remoteUrl, res)
  } catch {
    /* ignore */
  } finally {
    clearTimeout(timer)
    if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
  }
}
