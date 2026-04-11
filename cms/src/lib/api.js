export const API_BASE = import.meta.env.VITE_API_URL || '/api'

/** `/uploads/...` 절대 URL (로컬은 Vite 프록시 origin, 운영은 API와 동일 호스트) */
export function getUploadsOrigin() {
  const apiUrl = import.meta.env.VITE_API_URL
  if (apiUrl && String(apiUrl).trim()) {
    return String(apiUrl).replace(/\/api\/?$/i, '').replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') return window.location.origin.replace(/\/$/, '')
  return ''
}

const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized'

export function getToken() {
  return localStorage.getItem('token')
}

/** 401 시 토큰 제거 후 로그인 페이지로 보내기 위해 호출 */
export function clearTokenAndNotify() {
  localStorage.removeItem('token')
  window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT))
}

/** fetch 실패 시 JSON detail·HTML·빈 응답까지 구분해 메시지 생성 (구체적 원인 표시) */
function parseApiErrorBody(bodyText, statusText) {
  const st = (statusText || '').trim()
  if (!bodyText || !String(bodyText).trim()) return st || ''
  const raw = String(bodyText)
  try {
    const j = JSON.parse(raw)
    if (j.detail != null) {
      const d = j.detail
      if (typeof d === 'string') return d
      if (Array.isArray(d))
        return d
          .map((item) =>
            typeof item === 'object' && item && 'msg' in item ? item.msg : JSON.stringify(item),
          )
          .join('; ')
      return typeof d === 'object' ? JSON.stringify(d) : String(d)
    }
    if (j.message != null) return String(j.message)
  } catch {
    const t = raw.trim().replace(/\s+/g, ' ')
    if (t.length) return t.slice(0, 500)
  }
  return st
}

export async function api(path, options = {}) {
  const token = getToken()
  const hasBody = options.body != null && options.body !== ''
  const headers = {
    ...(hasBody && { 'Content-Type': 'application/json' }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }
  const method = (options.method || 'GET').toUpperCase()
  let urlPath = path
  if (method === 'GET' && typeof path === 'string' && !String(path).includes('_nocache=')) {
    urlPath = path.includes('?') ? `${path}&_nocache=${Date.now()}` : `${path}?_nocache=${Date.now()}`
  }
  const res = await fetch(`${API_BASE}${urlPath}`, { ...options, headers, cache: 'no-store' })
  if (res.status === 401) {
    clearTokenAndNotify()
    const bodyText = await res.text()
    const inner = parseApiErrorBody(bodyText, res.statusText)
    throw new Error(inner || '로그인이 만료되었습니다. 다시 로그인해 주세요.')
  }
  if (!res.ok) {
    const bodyText = await res.text()
    const inner = parseApiErrorBody(bodyText, res.statusText).trim() || '요청 실패'
    throw new Error(`HTTP ${res.status}: ${inner}`)
  }
  if (res.status === 204 || res.headers.get('Content-Length') === '0') return null
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** multipart/form-data 파일 업로드 (Content-Type 자동 설정) */
export async function uploadFile(path, formData) {
  const token = getToken()
  const headers = {
    ...(token && { Authorization: `Bearer ${token}` }),
  }
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData, cache: 'no-store' })
  if (!res.ok) {
    const bodyText = await res.text()
    const inner = parseApiErrorBody(bodyText, res.statusText).trim() || '업로드 실패'
    throw new Error(`HTTP ${res.status}: ${inner}`)
  }
  return res.json()
}
