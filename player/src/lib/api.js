const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:8000/api')

const DEVICE_ID_KEY = 'did_device_id'

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
  if (options.cacheBust) url.searchParams.set('_', String(Date.now()))
  const res = await fetch(url.toString())
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
