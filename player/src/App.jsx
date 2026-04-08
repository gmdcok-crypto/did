import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getDeviceId,
  setDeviceId,
  clearDeviceId,
  registerDevice,
  fetchSchedule,
  sendEvents,
  getScheduleEventsUrl,
  getMediaBaseUrl,
  DEVICE_NOT_FOUND,
  purgePlayerScheduleCaches,
} from './lib/api'

const POLL_INTERVAL_MS = 5 * 60 * 1000
const EVENT_QUEUE_KEY = 'did_event_queue'

function getEventQueue() {
  try {
    const s = localStorage.getItem(EVENT_QUEUE_KEY)
    return s ? JSON.parse(s) : []
  } catch {
    return []
  }
}

function saveEventQueue(queue) {
  localStorage.setItem(EVENT_QUEUE_KEY, JSON.stringify(queue))
}

function getDeviceIdFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return params.get('device_id')
}

export default function App() {
  const [deviceId, setDeviceIdState] = useState(() => getDeviceId())
  const [schedule, setSchedule] = useState(null)
  const [error, setError] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [registerAuthCode, setRegisterAuthCode] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerLocation, setRegisterLocation] = useState('')
  const [registerError, setRegisterError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const eventQueueRef = useRef(getEventQueue())
  const currentContentRef = useRef(null)

  const loadSchedule = useCallback(async (forceRefresh = false) => {
    if (!deviceId) return
    try {
      setError(null)
      const data = await fetchSchedule(deviceId, forceRefresh ? { cacheBust: true } : {})
      setSchedule(data)
      if (data) {
        sessionStorage.setItem('did_schedule_cache', JSON.stringify(data))
        try { localStorage.setItem('did_schedule_cache', JSON.stringify(data)) } catch (_) {}
      }
      return data
    } catch (e) {
      // CMS에서 기기 삭제됨: 로컬/캐시로 옛 스케줄 재생하지 않고 재등록 유도
      if (e.code === DEVICE_NOT_FOUND) {
        clearDeviceId()
        sessionStorage.removeItem('did_schedule_cache')
        try {
          localStorage.removeItem('did_schedule_cache')
        } catch (_) {}
        await purgePlayerScheduleCaches()
        setDeviceIdState(null)
        setSchedule(null)
        setError(null)
        setShowSettings(true)
        return null
      }
      const cached = sessionStorage.getItem('did_schedule_cache') || (typeof localStorage !== 'undefined' ? localStorage.getItem('did_schedule_cache') : null)
      if (cached && !forceRefresh) {
        try {
          const parsed = JSON.parse(cached)
          setSchedule(parsed)
          setError(null)
          return parsed
        } catch (_) {}
      }
      setError(e.message)
    }
  }, [deviceId])

  // 옛 PWA 설정(NetworkFirst 스케줄 캐시) 잔여분 제거 — 한 번 로드 시 정리
  useEffect(() => {
    purgePlayerScheduleCaches()
  }, [])

  // URL에 device_id가 있으면 적용 (CMS에서 링크로 넣을 때)
  useEffect(() => {
    const fromUrl = getDeviceIdFromUrl()
    if (fromUrl) {
      setDeviceId(fromUrl)
      setDeviceIdState(fromUrl)
      const url = new URL(window.location.href)
      url.searchParams.delete('device_id')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [])

  // 자동 등록 제거: 인증코드+이름+위치 입력 후 등록 버튼으로만 등록

  useEffect(() => {
    if (!deviceId) return
    loadSchedule().then((data) => {
      if (data) {
        sessionStorage.setItem('did_schedule_cache', JSON.stringify(data))
        try { localStorage.setItem('did_schedule_cache', JSON.stringify(data)) } catch (_) {}
      }
    })
    const t = setInterval(loadSchedule, POLL_INTERVAL_MS)
    let es = null
    const connect = () => {
      if (es) es.close()
      es = new EventSource(getScheduleEventsUrl())
      es.onmessage = (e) => {
        if (e.data === 'schedule_updated') loadSchedule(true)
      }
      es.onerror = () => {
        es.close()
        es = null
        setTimeout(connect, 3000)
      }
    }
    connect()
    return () => {
      clearInterval(t)
      if (es) es.close()
    }
  }, [deviceId, loadSchedule])

  // 탭이 다시 보일 때 스케줄 재조회 (CMS에서 저장 후 플레이어 탭으로 돌아오면 바로 반영)
  useEffect(() => {
    if (!deviceId) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadSchedule()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [deviceId, loadSchedule])

  useEffect(() => {
    const onOnline = () => {
      setOnline(true)
      loadSchedule()
      const q = getEventQueue()
      if (q.length && deviceId) {
        sendEvents(deviceId, q).then((ok) => {
          if (ok) saveEventQueue([])
        })
      }
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [deviceId, loadSchedule])

  const reportEvent = useCallback((contentId, eventType) => {
    const event = { content_id: contentId, event_type: eventType }
    if (online && deviceId) {
      sendEvents(deviceId, [event]).catch(() => {
        eventQueueRef.current.push(event)
        saveEventQueue(eventQueueRef.current)
      })
    } else {
      eventQueueRef.current.push(event)
      saveEventQueue(eventQueueRef.current)
    }
  }, [deviceId, online])

  const doRegister = async () => {
    const code = registerAuthCode.trim()
    if (!code) {
      setRegisterError('인증코드를 입력하세요.')
      return
    }
    setRegisterError('')
    try {
      const id = await registerDevice(
        code,
        registerName.trim() || '디바이스',
        registerLocation.trim(),
        null,
        getDeviceId() || undefined
      )
      setDeviceIdState(id)
      setRegisterName('')
      setRegisterLocation('')
      setRegisterAuthCode('')
      setShowSettings(false)
      // 등록 직후에는 아직 deviceId 상태가 갱신되지 않으므로, 새 id로 스케줄 요청해 기기를 online으로 표시
      try {
        const data = await fetchSchedule(id)
        setSchedule(data)
        if (data) sessionStorage.setItem('did_schedule_cache', JSON.stringify(data))
      } catch (_) {}
      loadSchedule()
    } catch (e) {
      setRegisterError(e.message || '등록 실패')
    }
  }

  const openSettings = () => {
    setRegisterError('')
    setShowSettings(true)
  }

  if (error && !schedule) {
    return (
      <div className="player-full error-screen">
        <div className="player-settings-wrap">
          <button type="button" className="player-settings-btn" onClick={openSettings} title="디바이스 등록">
            ⚙
          </button>
          {showSettings && (
            <div className="player-settings-panel">
              <p className="player-settings-hint" style={{ marginBottom: '0.75rem' }}>
                인증코드·이름·위치를 입력하고 등록하면 디바이스 목록에 표시됩니다.
              </p>
              <label>인증코드 (필수)</label>
              <input
                type="text"
                value={registerAuthCode}
                onChange={(e) => setRegisterAuthCode(e.target.value)}
                placeholder="회사에서 안내한 인증코드"
              />
              <label>이름</label>
              <input
                type="text"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="예: 1층 로비 키오스크"
              />
              <label>위치</label>
              <input
                type="text"
                value={registerLocation}
                onChange={(e) => setRegisterLocation(e.target.value)}
                placeholder="예: 본점 1층"
              />
              <div className="player-settings-actions">
                <button type="button" className="btn btn-sm btn-primary" onClick={doRegister}>
                  등록
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setShowSettings(false)}>
                  닫기
                </button>
              </div>
              {registerError && <p className="player-settings-error">{registerError}</p>}
            </div>
          )}
        </div>
        <p>오프라인 또는 서버 연결 실패</p>
        <p className="small">{error}</p>
        <p className="small">백엔드가 실행 중이면 우측 상단 ⚙에서 인증코드로 디바이스를 등록하세요.</p>
        <button type="button" className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => loadSchedule()}>
          다시 시도
        </button>
      </div>
    )
  }

  if (!deviceId) {
    return (
      <div className="player-full" style={{ flexDirection: 'column', gap: '1rem' }}>
        <div className="player-settings-wrap">
          <button type="button" className="player-settings-btn" onClick={openSettings} title="디바이스 등록">
            ⚙
          </button>
          {showSettings && (
            <div className="player-settings-panel">
              <p className="player-settings-hint" style={{ marginBottom: '0.75rem' }}>
                인증코드·이름·위치를 입력하고 등록하면 디바이스 목록에 표시됩니다.
              </p>
              <label>인증코드 (필수)</label>
              <input
                type="text"
                value={registerAuthCode}
                onChange={(e) => setRegisterAuthCode(e.target.value)}
                placeholder="회사에서 안내한 인증코드"
              />
              <label>이름</label>
              <input
                type="text"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="예: 1층 로비 키오스크"
              />
              <label>위치</label>
              <input
                type="text"
                value={registerLocation}
                onChange={(e) => setRegisterLocation(e.target.value)}
                placeholder="예: 본점 1층"
              />
              <div className="player-settings-actions">
                <button type="button" className="btn btn-sm btn-primary" onClick={doRegister}>
                  등록
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setShowSettings(false)}>
                  닫기
                </button>
              </div>
              {registerError && <p className="player-settings-error">{registerError}</p>}
            </div>
          )}
        </div>
        <p style={{ color: '#aaa', margin: 0 }}>디바이스가 등록되지 않았습니다.</p>
        <p className="small" style={{ color: '#666' }}>
          우측 상단 ⚙에서 인증코드로 등록하세요. CMS에서 기기를 삭제한 경우에도 이 화면으로 돌아와 다시 등록할 수 있습니다.
        </p>
      </div>
    )
  }

  const zones = schedule?.zones || [
    { id: 'zone_1', ratio: 1, content_type: 'placeholder', items: [] },
  ]

  return (
    <div className="player-full">
      {!online && <div className="offline-banner">오프라인 재생 중</div>}
      <div
        className="player-zones"
        style={{
          display: 'grid',
          ...(schedule?.layout_id === 'split_v'
            ? {
                gridTemplateRows: zones.map((z) => `${z.ratio * 100}fr`).join(' '),
                gridTemplateColumns: '1fr',
              }
            : {
                gridTemplateColumns: zones.map((z) => `${z.ratio * 100}fr`).join(' '),
              }),
          gap: 0,
          width: '100%',
          height: '100%',
        }}
      >
        {zones.map((zone) => (
          <Zone
            key={zone.id}
            zone={zone}
            reportEvent={reportEvent}
            currentContentRef={currentContentRef}
            mediaBaseUrl={getMediaBaseUrl()}
          />
        ))}
      </div>
    </div>
  )
}

function Zone({ zone, reportEvent, currentContentRef, mediaBaseUrl }) {
  const { content_type, items } = zone
  const [index, setIndex] = useState(0)
  const [prevIndex, setPrevIndex] = useState(null)
  const prevIndexRef = useRef(index)
  const clearPrevTimerRef = useRef(null)
  const item = items[index % (items.length || 1)]
  const duration = (item?.duration_sec || 10) * 1000

  useEffect(() => {
    if (!items?.length) return
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % items.length)
    }, duration)
    return () => clearInterval(t)
  }, [items?.length, duration])

  const clearPrevWhenReady = useCallback(() => {
    if (clearPrevTimerRef.current) {
      clearTimeout(clearPrevTimerRef.current)
      clearPrevTimerRef.current = null
    }
    setPrevIndex(null)
  }, [])

  useEffect(() => {
    if (prevIndexRef.current !== index) {
      setPrevIndex(prevIndexRef.current)
      prevIndexRef.current = index
      if (clearPrevTimerRef.current) clearTimeout(clearPrevTimerRef.current)
      const isVideo = item?.type === 'video'
      clearPrevTimerRef.current = setTimeout(() => {
        clearPrevTimerRef.current = null
        setPrevIndex(null)
      }, isVideo ? 8000 : 180)
      return () => {
        if (clearPrevTimerRef.current) clearTimeout(clearPrevTimerRef.current)
      }
    }
  }, [index, item?.type])

  if (content_type === 'placeholder' || !items?.length) {
    return (
      <div className="zone zone-placeholder">
        <span>대기 중</span>
      </div>
    )
  }

  if (!item) return null

  const prevItem = prevIndex != null ? items[prevIndex % items.length] : null
  const nextItem = items[(index + 1) % items.length]

  return (
    <div className="zone">
      {prevItem && prevItem.id !== item?.id && (
        <div className="media-wrap media-wrap-prev">
          <MediaBlock
            item={prevItem}
            reportEvent={reportEvent}
            currentContentRef={currentContentRef}
            mediaBaseUrl={mediaBaseUrl}
          />
        </div>
      )}
      <div className="media-wrap">
        <MediaBlock
          item={item}
          reportEvent={reportEvent}
          currentContentRef={currentContentRef}
          mediaBaseUrl={mediaBaseUrl}
          onReady={clearPrevWhenReady}
        />
      </div>
      {nextItem && nextItem.type === 'video' && nextItem.id !== item?.id && (
        <NextVideoPreload item={nextItem} mediaBaseUrl={mediaBaseUrl} />
      )}
    </div>
  )
}

function NextVideoPreload({ item, mediaBaseUrl }) {
  const url = (item.url && item.url.startsWith('/uploads')) ? (mediaBaseUrl || '') + item.url : (item.url || '')
  if (!url) return null
  return (
    <video
      src={url}
      preload="auto"
      muted
      playsInline
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      aria-hidden
    />
  )
}

function MediaBlock({ item, reportEvent, currentContentRef, mediaBaseUrl, onReady }) {
  const hasReported = useRef(false)
  const url = (item.url && item.url.startsWith('/uploads')) ? (mediaBaseUrl || '') + item.url : (item.url || '')

  useEffect(() => {
    if (hasReported.current) return
    hasReported.current = true
    reportEvent(item.id, 'impression')
    return () => {
      reportEvent(item.id, 'complete')
    }
  }, [item.id, reportEvent])

  if (item.type === 'video') {
    return (
      <video
        className="media media-video"
        src={url}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onCanPlay={() => onReady?.()}
        onLoadedData={() => onReady?.()}
        onError={() => reportEvent(item.id, 'error')}
      />
    )
  }

  if (item.type === 'image') {
    return (
      <img
        className="media media-image"
        src={url}
        alt=""
        onLoad={() => onReady?.()}
        onError={() => reportEvent(item.id, 'error')}
      />
    )
  }

  if (item.type === 'html') {
    return (
      <iframe
        className="media media-html"
        src={url}
        title=""
        onLoad={() => onReady?.()}
      />
    )
  }

  return (
    <div className="zone-placeholder">
      <span>지원하지 않는 타입: {item.type}</span>
    </div>
  )
}
