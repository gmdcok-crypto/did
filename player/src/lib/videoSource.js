/**
 * R2 progressive 재생은 TOX3에서 네트워크 흔들림에 바로 버벅인다.
 * CORS가 되면 파일을 받아 blob URL로 로컬 재생하고, 안 되면 원격 URL로 폴백한다.
 */

const VIDEO_CACHE = 'did-video-local-v1'
const MAX_BLOB_BYTES = 120 * 1024 * 1024
const FETCH_TIMEOUT_MS = 45000

function isRemoteMediaUrl(url) {
  if (!url) return false
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.href : undefined)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
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
    /* quota / opaque 등 무시 */
  }
}

/**
 * @param {string} remoteUrl
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ src: string, revoke?: () => void, local: boolean }>}
 */
export async function resolveVideoPlaySource(remoteUrl, opts = {}) {
  if (!remoteUrl || !isRemoteMediaUrl(remoteUrl)) {
    return { src: remoteUrl || '', local: false }
  }

  const cachedBlob = await blobFromCache(remoteUrl)
  if (cachedBlob && cachedBlob.size > 0) {
    const obj = URL.createObjectURL(cachedBlob)
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
  } catch {
    return { src: remoteUrl, local: false }
  } finally {
    clearTimeout(timer)
    if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
  }
}
