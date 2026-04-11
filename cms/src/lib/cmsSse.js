import { API_BASE } from './api'

/** SSE 데이터 메시지 (백엔드 sse_broadcast 와 동일) */
export const CMS_SSE_DEVICE_LIST = 'device_list_updated'
export const CMS_SSE_DASHBOARD = 'cms_dashboard_updated'

/**
 * GET /api/devices/events — 디바이스·대시보드 실시간 갱신용 SSE.
 * 연결 끊김 시 지수 백오프로 재연결 (한 번 에러로 영구 종료되지 않음).
 */
export function subscribeCmsDeviceEvents(onData, options = {}) {
  const maxDelayMs = options.maxDelayMs ?? 30000
  const baseDelayMs = options.baseDelayMs ?? 900
  let es = null
  let retryTimer = null
  let closed = false
  let attempt = 0

  const clearRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  const connect = () => {
    if (closed) return
    clearRetry()
    try {
      es?.close()
    } catch (_) {}
    es = new EventSource(`${API_BASE}/devices/events`)
    es.onopen = () => {
      attempt = 0
    }
    es.onmessage = (ev) => {
      attempt = 0
      try {
        onData(ev.data)
      } catch (_) {}
    }
    es.onerror = () => {
      try {
        es?.close()
      } catch (_) {}
      es = null
      if (closed) return
      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.min(attempt, 8))
      const jitter = exp * 0.15 * (Math.random() * 2 - 1)
      const delay = Math.max(400, Math.floor(exp + jitter))
      attempt += 1
      retryTimer = setTimeout(connect, delay)
    }
  }

  connect()

  return () => {
    closed = true
    clearRetry()
    try {
      es?.close()
    } catch (_) {}
    es = null
  }
}
