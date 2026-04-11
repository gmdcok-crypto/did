export const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:8000/api')

/** API_BASE 와 동일 호스트의 WebSocket origin (실시간 화면 push URL용) */
export function getWebSocketApiOrigin() {
  if (typeof window === 'undefined') return 'ws://localhost:8000'
  const v = import.meta.env.VITE_API_URL
  if (v && /^https?:\/\//i.test(String(v))) {
    const u = new URL(String(v).replace(/\/api\/?$/, ''))
    return (u.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + u.host
  }
  const loc = window.location
  return (loc.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + loc.host
}

/** 미디어(/uploads/...) 요청용 백엔드 주소. 상대 경로일 때 이미지가 나오도록 함 */
export function getMediaBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
  }
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000'
}

const DEVICE_ID_KEY = 'did_device_id'

/** CMS에서 기기 삭제 등으로 서버에 없을 때 (스케줄 404) */
export const DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND'

export function getDeviceId() {
  return localStorage.getItem(DEVICE_ID_KEY)
}

export function setDeviceId(id) {
  if (id && id.trim()) {
    localStorage.setItem(DEVICE_ID_KEY, id.trim())
    return true
  }
  return false
}

export function clearDeviceId() {
  localStorage.removeItem(DEVICE_ID_KEY)
}

/** PWA 캐시에 남은 스케줄 응답 제거 (기기 삭제 후 재등록 시 이전 화면 방지) */
export async function purgePlayerScheduleCaches() {
  if (typeof caches === 'undefined') return
  try {
    await caches.delete('schedule-cache')
    const names = await caches.keys()
    await Promise.all(
      names.map(async (name) => {
        const cache = await caches.open(name)
        const keys = await cache.keys()
        await Promise.all(
          keys
            .filter((req) => req.url.includes('player/schedule') || req.url.includes('/api/player/schedule'))
            .map((req) => cache.delete(req))
        )
      })
    )
  } catch (_) {}
}

const LEGACY_SCHEDULE_CACHE_KEY = 'did_schedule_cache'
const SCHEDULE_CACHE_PREFIX = 'did_schedule_cache:'
const CACHE_DEVICE_FIELD = '_did_cache_device'

/** 스케줄 오프라인 폴백은 기기별 키 + 기기 ID 검증 (단일 키는 재등록·뒤로가기 후 옛 JSON과 섞임) */
export function scheduleCacheStorageKey(deviceId) {
  if (!deviceId || !String(deviceId).trim()) return LEGACY_SCHEDULE_CACHE_KEY
  return `${SCHEDULE_CACHE_PREFIX}${String(deviceId).trim()}`
}

export function saveScheduleToStorage(deviceId, data) {
  if (!deviceId || !data || typeof sessionStorage === 'undefined') return
  let s
  try {
    const wrapped = { ...data, [CACHE_DEVICE_FIELD]: String(deviceId).trim() }
    s = JSON.stringify(wrapped)
  } catch (e) {
    console.warn('[DID player] 스케줄 캐시 직렬화 실패(재생은 계속됨):', e)
    return
  }
  const key = scheduleCacheStorageKey(deviceId)
  try {
    sessionStorage.setItem(key, s)
  } catch (_) {}
  try {
    localStorage.setItem(key, s)
  } catch (_) {}
  try {
    sessionStorage.removeItem(LEGACY_SCHEDULE_CACHE_KEY)
    localStorage.removeItem(LEGACY_SCHEDULE_CACHE_KEY)
  } catch (_) {}
}

export function readScheduleFromStorage(deviceId) {
  if (!deviceId || typeof sessionStorage === 'undefined') return null
  const key = scheduleCacheStorageKey(deviceId)
  let raw = sessionStorage.getItem(key)
  if (!raw && typeof localStorage !== 'undefined') raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed[CACHE_DEVICE_FIELD] !== String(deviceId).trim()) return null
    const { [CACHE_DEVICE_FIELD]: _d, ...rest } = parsed
    return rest
  } catch {
    return null
  }
}

/** 기기 삭제·재등록·URL로 기기 바꿀 때 — 옛 스케줄 JSON이 섞이지 않게 전부 제거 */
export function clearAllScheduleStorageCaches() {
  const sweep = (storage) => {
    if (!storage) return
    try {
      storage.removeItem(LEGACY_SCHEDULE_CACHE_KEY)
      const drop = []
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i)
        if (k && (k === LEGACY_SCHEDULE_CACHE_KEY || k.startsWith(SCHEDULE_CACHE_PREFIX))) drop.push(k)
      }
      drop.forEach((k) => storage.removeItem(k))
    } catch (_) {}
  }
  sweep(sessionStorage)
  try {
    sweep(localStorage)
  } catch (_) {}
}

/**
 * PWA/서비스워커·Cache Storage까지 비움 — 태블릿에서 캐시만 지워도 옛 JS가 남는 경우 대응.
 * 주소에 ?reset=1 붙여 한 번 들어오면 자동 실행 후 새로고침( App에서 처리 ).
 */
export async function hardResetPlayerCaches() {
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    } catch (_) {}
  }
  if (typeof caches !== 'undefined' && caches.keys) {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch (_) {}
  }
  clearAllScheduleStorageCaches()
  await purgePlayerScheduleCaches()
}

/** localStorage에 없으면 임시 ID 생성 (등록 전까지 사용) */
export function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}`
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export async function registerDevice(authCode, name, location, groupId = null, previousDeviceId = null) {
  const body = {
    auth_code: (authCode || '').trim(),
    name: name || 'Device',
    location: location || '',
    group_id: groupId,
  }
  if (previousDeviceId && previousDeviceId.trim()) body.previous_device_id = previousDeviceId.trim()
  const res = await fetch(`${API_BASE}/devices/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || '등록 실패')
  }
  const data = await res.json()
  if (data.device_id) {
    localStorage.setItem(DEVICE_ID_KEY, data.device_id)
    return data.device_id
  }
  return getOrCreateDeviceId()
}

export async function fetchSchedule(deviceId, options = {}) {
  const url = new URL(`${API_BASE}/player/schedule`)
  url.searchParams.set('device_id', deviceId)
  // 매 요청 고유 URL → 중간 캐시·옛 SW 엔트리와 충돌 방지 (스케줄은 항상 최신 서버 기준)
  url.searchParams.set('_', String(Date.now()))
  const urlStr = url.toString()

  const timeoutMs = options.timeoutMs ?? 25000
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetch(urlStr, { cache: 'no-store', signal: controller.signal })
  } catch (e) {
    clearTimeout(tid)
    if (e?.name === 'AbortError') {
      throw new Error('스케줄 요청 시간 초과(네트워크 지연·차단 가능)')
    }
    throw e
  }
  clearTimeout(tid)
  if (res.status === 404) {
    const errBody = await res.json().catch(() => ({}))
    const e = new Error(errBody.detail || 'Device not found')
    e.code = DEVICE_NOT_FOUND
    throw e
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const hint = text ? ` — ${text.slice(0, 200)}` : ''
    throw new Error(`스케줄 요청 실패 HTTP ${res.status}${hint}`)
  }
  const data = await res.json()
  logScheduleDeviceIdConsistency(deviceId, data)
  return data
}

/** 스케줄 응답의 device_id 와 요청한 UUID 비교 — 실시간 화면/CMS 연동 점검용 */
let _scheduleDeviceIdHintLogged = false
export function logScheduleDeviceIdConsistency(requestedDeviceId, schedule) {
  if (!schedule || typeof schedule !== 'object') return
  const sid = schedule.device_id
  if (sid == null || String(sid).trim() === '') return
  const req = String(requestedDeviceId || '').trim()
  const srv = String(sid).trim()
  if (req !== srv) {
    console.warn('[DID player] device_id 요청·응답 불일치 — 프록시/캐시 이상 가능', {
      requested: req,
      server: srv,
    })
    return
  }
  if (!_scheduleDeviceIdHintLogged) {
    _scheduleDeviceIdHintLogged = true
    console.info(
      '[DID player] 서버 확인 device_id (CMS 디바이스 목록의 device_id와 같아야 실시간 화면이 동작합니다):',
      srv,
    )
  }
}

/** 등록 직후·불안정 네트워크에서 한 번 실패하면 화면이 비어 보이는 것 완화 */
export async function fetchScheduleReliable(deviceId, options = {}) {
  const attempts = options.attempts ?? 5
  const { attempts: _a, ...rest } = options
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchSchedule(deviceId, {
        ...rest,
        cacheBust: i > 0 || rest.cacheBust,
        timeoutMs: rest.timeoutMs ?? 22000,
      })
    } catch (e) {
      lastErr = e
      if (e.code === DEVICE_NOT_FOUND) throw e
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 280 * (i + 1)))
      }
    }
  }
  throw lastErr
}

export function getScheduleEventsUrl() {
  return `${API_BASE}/player/events`
}

/** CMS 실시간 화면 스트리밍: 플레이어 → 서버 WebSocket 송신 URL */
export function getLiveScreenPushWsUrl(deviceId, ticket) {
  const origin = getWebSocketApiOrigin()
  const url = new URL('/api/player/ws/live-screen', origin)
  url.searchParams.set('device_id', deviceId)
  url.searchParams.set('ticket', ticket)
  return url.toString()
}

export async function pollLiveScreenCapture(deviceId) {
  const url = new URL(`${API_BASE}/player/live-screen-poll`)
  url.searchParams.set('device_id', deviceId)
  url.searchParams.set('_', String(Date.now()))
  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) return { capture: false }
  const data = await res.json()
  if (data?.capture && data?.ticket) {
    console.log('[DID player] live-screen-poll 실시간 화면 요청 수신', {
      device_id: deviceId,
      ticket: `${String(data.ticket).slice(0, 8)}…`,
    })
  }
  return data
}

/**
 * 탭 닫기·창 종료·백그라운드 장시간 시 서버에 오프라인 반영.
 * - GET 비콘을 먼저 시도: 모바일 Chrome 등에서 JSON POST sendBeacon 이 실패하는 경우가 많음.
 * - F5 새로고침은 제외. 전원 강제 차단·크래시 시에는 last_seen·서버 주기 오프라인에 의존.
 */
export function notifyPlayerOffline(deviceId) {
  if (!deviceId || typeof window === 'undefined') return
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0]
    if (nav?.type === 'reload') return
  } catch (_) {}
  const id = encodeURIComponent(deviceId)
  const getUrl = `${API_BASE}/player/offline-beacon?device_id=${id}`
  if (navigator.sendBeacon?.(getUrl)) return

  const postUrl = `${API_BASE}/player/offline`
  const body = JSON.stringify({ device_id: deviceId })
  const blob = new Blob([body], { type: 'application/json' })
  if (navigator.sendBeacon?.(postUrl, blob)) return
  fetch(postUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
    cache: 'no-store',
  }).catch(() => {})
}

export async function sendEvents(deviceId, events) {
  const res = await fetch(`${API_BASE}/events/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: deviceId,
      events: events.map((e) => ({ content_id: e.content_id, event_type: e.event_type })),
    }),
  })
  return res.ok
}
