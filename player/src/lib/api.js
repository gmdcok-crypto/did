const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:8000/api')

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

  const res = await fetch(urlStr, { cache: 'no-store' })
  if (res.status === 404) {
    const errBody = await res.json().catch(() => ({}))
    const e = new Error(errBody.detail || 'Device not found')
    e.code = DEVICE_NOT_FOUND
    throw e
  }
  if (!res.ok) throw new Error('Schedule fetch failed')
  return res.json()
}

export function getScheduleEventsUrl() {
  return `${API_BASE}/player/events`
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
