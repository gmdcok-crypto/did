import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  getDeviceId,
  setDeviceId,
  clearDeviceId,
  registerDevice,
  fetchSchedule,
  fetchScheduleReliable,
  sendEvents,
  getScheduleEventsUrl,
  getMediaBaseUrl,
  pollLiveScreenCapture,
  uploadLiveScreen,
  notifyPlayerOffline,
  DEVICE_NOT_FOUND,
  purgePlayerScheduleCaches,
  saveScheduleToStorage,
  readScheduleFromStorage,
  clearAllScheduleStorageCaches,
  hardResetPlayerCaches,
} from './lib/api'
import { capturePlayerZones, resolveLiveCaptureRoot, capturePlaceholderBlob } from './lib/capture'
import { crossOriginForMediaUrl } from './lib/mediaCrossOrigin'

/** 스케줄 폴링 — last_seen 갱신 주기(오프라인 판정과 맞춤, 기본 2분) */
const POLL_INTERVAL_MS = 2 * 60 * 1000
const EVENT_QUEUE_KEY = 'did_event_queue'
/** 이미지 전환 페이드 — style.css `mediaImageFadeIn` 길이와 맞출 것 */
const IMAGE_FADE_MS = 550

/** img/video는 onError에 HTTP 상태가 없음 — 동일 URL은 한 번만 콘솔에 남김 */
const _mediaLoadErrLogged = new Set()
function logMediaLoadFailure(kind, contentId, url) {
  const key = `${kind}|${contentId}|${url}`
  if (_mediaLoadErrLogged.has(key)) return
  _mediaLoadErrLogged.add(key)
  console.error(
    '[DID player] 미디어 로드 실패 — 개발자도구(F12) → Network에서 아래 URL 선택하면 상태코드(403·404 등) 확인 가능',
    { kind, contentId, url },
  )
}

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

function isDebugUrl() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

/** 하단에 기기 UUID·CMS와의 일치 여부를 직접 표시 (?show_device=1) */
function showDeviceIdStripUrl() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('show_device') === '1'
}

function deviceIdMatchInfo(deviceId, schedule) {
  const local = String(deviceId || '').trim()
  const server = schedule?.device_id != null ? String(schedule.device_id).trim() : ''
  if (!local) return { local, server, matchLabel: 'localStorage 없음', ok: null }
  if (!server) return { local, server, matchLabel: '스케줄 응답 대기 중', ok: null }
  if (local === server) return { local, server, matchLabel: '일치 (실시간 화면·CMS device_id 동일)', ok: true }
  return { local, server, matchLabel: '불일치 — CMS 목록 device_id 와 다를 수 있음', ok: false }
}

function DeviceIdStrip({ deviceId, schedule }) {
  if (!showDeviceIdStripUrl()) return null
  const m = deviceIdMatchInfo(deviceId, schedule)
  const cls =
    m.ok === true ? 'player-device-id-strip match' : m.ok === false ? 'player-device-id-strip mismatch' : 'player-device-id-strip'
  return (
    <div className={cls} role="status">
      <div>
        <strong>localStorage</strong> did_device_id: {m.local || '(없음)'}
      </div>
      <div>
        <strong>서버</strong> schedule.device_id: {m.server || '(아직 없음)'}
      </div>
      <div className="player-device-id-strip-verdict">→ {m.matchLabel}</div>
    </div>
  )
}

/** 탭 복귀 시 일부 모바일 브라우저에서 비디오가 멈춘 채 검은 화면만 남는 현상 완화 */
function nudgeVideoPlayback() {
  if (typeof document === 'undefined') return
  requestAnimationFrame(() => {
    document.querySelectorAll('video.media-video').forEach((v) => {
      v.play?.().catch(() => {})
    })
  })
}

/** bfcache(뒤로가기 복원) 후 비디오·스케줄이 꼬이는 경우 */
function recoverMediaAfterPageShow() {
  if (typeof document === 'undefined') return
  requestAnimationFrame(() => {
    document.querySelectorAll('video.media-video').forEach((v) => {
      try {
        v.load()
      } catch (_) {}
      v.play?.().catch(() => {})
    })
  })
}

function summarizeScheduleZonesForDebug(schedule) {
  if (!schedule?.zones?.length) return '(zones 없음)'
  const lines = schedule.zones.slice(0, 3).map((z, i) => {
    const items = z.items || []
    const n = items.length
    if (n === 0) return `z${i + 1}: items 0`
    const it = items[0]
    const ty = it?.type ?? '?'
    if (ty === 'placeholder') return `z${i + 1}: placeholder만 (${n}슬롯)`
    const u = String(it?.url || '')
    const short = u.length > 64 ? `${u.slice(0, 64)}…` : u || '(url 없음)'
    return `z${i + 1}: ${n}개 · 첫=${ty} · ${short}`
  })
  return lines.join(' | ')
}

function DebugHud({ deviceId, schedule, error, online }) {
  if (!isDebugUrl()) return null
  const apiHint = typeof window !== 'undefined' ? `${window.location.origin}/api` : ''
  const zc = schedule?.zones?.length ?? 0
  const mid = deviceIdMatchInfo(deviceId, schedule)
  return (
    <div className="player-debug-hud" aria-hidden>
      <div className="player-debug-hud-title">debug=1</div>
      <div className="player-debug-hud-mono">localStorage: {mid.local || '(없음)'}</div>
      <div className="player-debug-hud-mono">서버 schedule.device_id: {mid.server || '(없음)'}</div>
      <div className={mid.ok === false ? 'player-debug-hud-warn' : undefined}>→ {mid.matchLabel}</div>
      <div>schedule: {schedule ? `로드됨 · zones ${zc}` : '(없음)'}</div>
      {schedule && (
        <div className="player-debug-hud-mono player-debug-hud-zones">{summarizeScheduleZonesForDebug(schedule)}</div>
      )}
      <div>error: {error || '—'}</div>
      <div>online: {String(online)}</div>
      <div className="player-debug-hud-mono">API: {apiHint}</div>
      <div className="player-debug-hud-hint">
        UUID 하단 고정: URL에 ?show_device=1 · 미디어 실패는 F12 또는 여기서 확인 · 복구: ?reset=1
      </div>
    </div>
  )
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
  const [stuckHint, setStuckHint] = useState(false)
  const eventQueueRef = useRef(getEventQueue())
  const zonesRef = useRef(null)
  const deviceIdRef = useRef(deviceId)
  const liveScreenTickRef = useRef(async () => {})

  useEffect(() => {
    deviceIdRef.current = deviceId
  }, [deviceId])

  // 옛 단일 키 did_schedule_cache 가 남아 있으면 다른 기기·세션과 섞여 폴백이 오염됨 → 제거
  useEffect(() => {
    if (!deviceId) return
    try {
      sessionStorage.removeItem('did_schedule_cache')
      localStorage.removeItem('did_schedule_cache')
    } catch (_) {}
  }, [deviceId])

  const loadSchedule = useCallback(async (forceRefresh = false) => {
    if (!deviceId) return
    try {
      setError(null)
      const data = await fetchSchedule(deviceId, forceRefresh ? { cacheBust: true } : {})
      setSchedule(data)
      if (data) {
        saveScheduleToStorage(deviceId, data)
      }
      return data
    } catch (e) {
      // CMS에서 기기 삭제됨: 로컬/캐시로 옛 스케줄 재생하지 않고 재등록 유도
      if (e.code === DEVICE_NOT_FOUND) {
        clearDeviceId()
        clearAllScheduleStorageCaches()
        await purgePlayerScheduleCaches()
        setDeviceIdState(null)
        setSchedule(null)
        setError(null)
        setShowSettings(true)
        return null
      }
      const cached = readScheduleFromStorage(deviceId)
      if (cached && !forceRefresh) {
        setSchedule(cached)
        setError(null)
        return cached
      }
      const msg = e?.message || String(e)
      console.error('[DID player] 스케줄 요청 실패:', msg)
      setError(msg)
    }
  }, [deviceId])

  // 옛 PWA 설정(NetworkFirst 스케줄 캐시) 잔여분 제거 — 한 번 로드 시 정리
  useEffect(() => {
    purgePlayerScheduleCaches()
  }, [])

  // ?reset=1 — 스토리지·서비스워커·Cache API 전부 비우고 새로고침 (태블릿 등에서만 안 나올 때)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('reset') !== '1') return
    let cancelled = false
    ;(async () => {
      try {
        await hardResetPlayerCaches()
      } catch (_) {}
      if (cancelled) return
      params.delete('reset')
      const qs = params.toString()
      const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`
      window.history.replaceState({}, '', next)
      window.location.reload()
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** 스케줄이 오래 null이면(네트워크/ SW 꼬임) 수동 복구 안내 */
  useEffect(() => {
    const loading = Boolean(deviceId && schedule === null && !error)
    if (!loading) {
      setStuckHint(false)
      return
    }
    const t = setTimeout(() => setStuckHint(true), 28000)
    return () => {
      clearTimeout(t)
      setStuckHint(false)
    }
  }, [deviceId, schedule, error])

  // URL에 device_id가 있으면 적용 (CMS에서 링크로 넣을 때)
  useEffect(() => {
    const fromUrl = getDeviceIdFromUrl()
    if (fromUrl) {
      const prev = getDeviceId()
      if (prev && prev !== fromUrl.trim()) clearAllScheduleStorageCaches()
      setDeviceId(fromUrl)
      setDeviceIdState(fromUrl)
      const url = new URL(window.location.href)
      url.searchParams.delete('device_id')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [])

  // 오프라인 알림: pagehide(데스크톱·일부 모바일) + 화면 장시간 숨김(모바일은 탭 종료 시 pagehide 가 안 오는 경우 많음)
  useEffect(() => {
    if (!deviceId) return
    /** 짧게 다른 앱만 본 뒤 돌아오면 오프라인 처리 안 함 — 너무 짧으면 취소 */
    const HIDDEN_OFFLINE_MS = 22000
    let hiddenTimer = null
    const clearHiddenTimer = () => {
      if (hiddenTimer) {
        clearTimeout(hiddenTimer)
        hiddenTimer = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        clearHiddenTimer()
        hiddenTimer = setTimeout(() => {
          hiddenTimer = null
          notifyPlayerOffline(deviceIdRef.current)
        }, HIDDEN_OFFLINE_MS)
      } else {
        clearHiddenTimer()
      }
    }
    const onPageHide = (e) => {
      if (e.persisted) return
      clearHiddenTimer()
      notifyPlayerOffline(deviceIdRef.current)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      clearHiddenTimer()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [deviceId])

  // 자동 등록 제거: 인증코드+이름+위치 입력 후 등록 버튼으로만 등록

  // CMS 실시간 화면: SSE(live_screen_request)로 즉시 캡처 + 폴링 백업
  useEffect(() => {
    if (!deviceId) return
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      try {
        const id = deviceIdRef.current
        if (!id) return
        const data = await pollLiveScreenCapture(id)
        if (!data?.capture || !data?.ticket) return
        const ticket = data.ticket
        const root = resolveLiveCaptureRoot(zonesRef)
        if (!root) {
          console.warn('[DID player] 실시간 화면: 캡처할 DOM 영역을 찾지 못함')
          const fb = await capturePlaceholderBlob('캡처 영역 없음 · 플레이어 페이지를 열었는지 확인')
          if (fb && !cancelled) await uploadLiveScreen(id, ticket, fb)
          return
        }
        // 비디오 프레임·업로드 준비까지 여러 번 시도 (검은 캡처·일시 실패 완화)
        for (let attempt = 0; attempt < 18; attempt++) {
          if (cancelled) return
          let blob = await capturePlayerZones(root)
          if (!blob && attempt >= 5) {
            blob = await capturePlaceholderBlob('미디어 캡처 실패(CORS·로딩) · 동일 출처 미디어 권장')
          }
          if (blob && !cancelled) {
            const ok = await uploadLiveScreen(id, ticket, blob)
            if (ok) return
          }
          await new Promise((r) => setTimeout(r, 320))
        }
      } catch {
        /* 네트워크 오류 무시 */
      }
    }
    liveScreenTickRef.current = tick
    const intervalMs = 850
    const timer = setInterval(tick, intervalMs)
    tick()
    return () => {
      cancelled = true
      liveScreenTickRef.current = async () => {}
      clearInterval(timer)
    }
  }, [deviceId])

  useEffect(() => {
    if (!deviceId) return
    loadSchedule()
    const t = setInterval(loadSchedule, POLL_INTERVAL_MS)
    let es = null
    const connect = () => {
      if (es) es.close()
      es = new EventSource(getScheduleEventsUrl())
      es.onmessage = (e) => {
        const msg = e.data
        if (msg === 'schedule_updated') loadSchedule(true)
        else if (typeof msg === 'string' && msg.startsWith('live_screen_request:')) {
          const target = msg.slice('live_screen_request:'.length).trim()
          if (target && target === deviceIdRef.current) {
            liveScreenTickRef.current?.()
          }
        }
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
      if (document.visibilityState === 'visible') {
        loadSchedule()
        nudgeVideoPlayback()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [deviceId, loadSchedule])

  // 모바일 Safari/Chrome: 첫 방문은 되다가 뒤로 갔다가 다시 들어오면(bfcache) 검은 화면만 남는 경우
  useEffect(() => {
    if (!deviceId) return
    const onPageShow = (e) => {
      if (!e.persisted) return
      loadSchedule(true)
      recoverMediaAfterPageShow()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
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
      clearAllScheduleStorageCaches()
      setDeviceIdState(id)
      setRegisterName('')
      setRegisterLocation('')
      setRegisterAuthCode('')
      setShowSettings(false)
      // 등록 직후 새 id로 스케줄 로드 (한 번 실패 시 조용히 넘어가면 화면이 비어 있고, 다음은 2분 폴링까지 기다림)
      try {
        const data = await fetchScheduleReliable(id, { attempts: 5 })
        setSchedule(data)
        if (data) saveScheduleToStorage(id, data)
      } catch (e) {
        console.warn('[DID player] 등록 직후 스케줄 로드 재시도 후에도 실패 — 자동 폴링·SSE가 이어짐', e)
      }
    } catch (e) {
      setRegisterError(e.message || '등록 실패')
    }
  }

  const openSettings = () => {
    setRegisterError('')
    setShowSettings(true)
  }

  // early return 전에 두어야 함 — 그렇지 않으면 deviceId 유무에 따라 훅 개수가 달라져 React #310
  const zones =
    schedule?.zones && schedule.zones.length > 0
      ? schedule.zones
      : [{ id: 'zone_1', ratio: 1, content_type: 'placeholder', items: [] }]

  const zoneRatio = (z) => {
    const r = Number(z?.ratio)
    return Number.isFinite(r) && r > 0 ? r : 1
  }

  const scheduleLoadError = Boolean(error && !schedule)
  /** 첫 스케줄 응답 전·요청 중 — 오류는 아님 */
  const scheduleLoading = Boolean(deviceId && schedule === null && !error)

  /** 스케줄은 왔지만 캠페인/콘텐츠가 비어 placeholder만 → ‘안 나옴’으로 느껴지는 경우 */
  const scheduleHasPlayableItems = useMemo(() => {
    if (!schedule?.zones?.length) return false
    return schedule.zones.some((z) =>
      (z.items || []).some((it) => it && it.type && it.type !== 'placeholder'),
    )
  }, [schedule])
  const showNoContentHint = Boolean(
    schedule && !scheduleHasPlayableItems && !scheduleLoading && !scheduleLoadError,
  )

  const goHardReset = () => {
    const u = new URL(window.location.href)
    u.searchParams.set('reset', '1')
    window.location.href = u.toString()
  }

  if (!deviceId) {
    return (
      <>
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
      <DebugHud deviceId={deviceId} schedule={schedule} error={error} online={online} />
      <DeviceIdStrip deviceId={deviceId} schedule={schedule} />
      </>
    )
  }

  return (
    <>
    <div className="player-full">
      {scheduleLoading && (
        <div className="player-schedule-loading-banner" role="status">
          스케줄 연결 중…
        </div>
      )}
      {scheduleLoading && stuckHint && (
        <div className="player-stuck-banner" role="alert">
          <p className="player-stuck-banner-text">화면이 계속 비면 PWA·캐시·서비스워커 문제일 수 있습니다.</p>
          <button type="button" className="btn btn-primary player-stuck-banner-btn" onClick={goHardReset}>
            캐시 초기화 후 새로고침
          </button>
        </div>
      )}
      {scheduleLoadError && (
        <div className="player-schedule-error-overlay player-full error-screen">
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
      )}
      {!online && <div className="offline-banner">오프라인 재생 중</div>}
      {showNoContentHint && (
        <div className="player-no-content-banner" role="status">
          <strong>재생할 콘텐츠가 없습니다.</strong>
          <span className="player-no-content-banner-sub">
            CMS에서 이 기기의 <strong>디바이스 그룹</strong>에 맞는 <strong>활성 스케줄</strong>과{' '}
            <strong>캠페인·콘텐츠</strong>를 넣었는지 확인하세요.
          </span>
          <a className="player-no-content-banner-link" href="/admin/" target="_blank" rel="noreferrer">
            관리자 열기 (/admin/)
          </a>
        </div>
      )}
      <div
        ref={zonesRef}
        className="player-zones"
        style={{
          display: 'grid',
          // minmax(0, fr) — 그리드 자식 min-width:auto 때문에 존 너비·높이 0으로 붕괴해 검은 화면만 나오는 현상 방지
          ...(schedule?.layout_id === 'split_v'
            ? {
                gridTemplateRows: zones.map((z) => `minmax(0,${zoneRatio(z) * 100}fr)`).join(' '),
                gridTemplateColumns: 'minmax(0,1fr)',
              }
            : {
                gridTemplateColumns: zones.map((z) => `minmax(0,${zoneRatio(z) * 100}fr)`).join(' '),
              }),
          gap: 0,
        }}
      >
        {(zones || []).filter((z) => z != null && typeof z === 'object').map((zone, zi) => (
          <Zone
            key={zone.id != null ? String(zone.id) : `zone-${zi}`}
            zone={zone}
            reportEvent={reportEvent}
            mediaBaseUrl={getMediaBaseUrl()}
          />
        ))}
      </div>
    </div>
    <DebugHud deviceId={deviceId} schedule={schedule} error={error} online={online} />
    <DeviceIdStrip deviceId={deviceId} schedule={schedule} />
    </>
  )
}

function Zone({ zone, reportEvent, mediaBaseUrl }) {
  // zone 이 잠깐 비어 있으면 destructuring 이 훅보다 먼저 throw → 다음 렌더에서 훅 개수 불일치(React #310)
  const content_type = zone?.content_type
  const items = zone?.items ?? []
  const [index, setIndex] = useState(0)
  const [prevIndex, setPrevIndex] = useState(null)
  const prevIndexRef = useRef(index)
  const clearPrevTimerRef = useRef(null)
  const len = items.length
  const item = len > 0 ? items[index % len] : undefined
  const duration = (item?.duration_sec || 10) * 1000

  const advance = useCallback(() => {
    setIndex((i) => (len > 0 ? (i + 1) % len : 0))
  }, [len])

  // 이미지·HTML 등: 슬롯 시간(duration_sec)마다 다음 미디어. 영상은 재생 끝(onEnded)에서만 넘김.
  useEffect(() => {
    if (!items?.length) return
    if (item?.type === 'video') return
    const t = setInterval(() => {
      setIndex((i) => (items.length > 0 ? (i + 1) % items.length : 0))
    }, duration)
    return () => clearInterval(t)
  }, [items?.length, duration, item?.type, item?.id])

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
      const prevClearMs = isVideo
        ? 8000
        : item?.type === 'image'
          ? IMAGE_FADE_MS + 100
          : 180
      clearPrevTimerRef.current = setTimeout(() => {
        clearPrevTimerRef.current = null
        setPrevIndex(null)
      }, prevClearMs)
      return () => {
        if (clearPrevTimerRef.current) clearTimeout(clearPrevTimerRef.current)
      }
    }
  }, [index, item?.type])

  // 백엔드는 빈 존에도 content_type은 video 등으로 두고 items만 placeholder로 채움
  if (
    content_type === 'placeholder' ||
    !items?.length ||
    item?.type === 'placeholder' ||
    !item
  ) {
    return (
      <div className="zone zone-placeholder">
        <span>대기 중</span>
      </div>
    )
  }

  const prevItem = prevIndex != null ? items[prevIndex % items.length] : null
  const nextItem = items[(index + 1) % items.length]

  return (
    <div className="zone">
      {prevItem && prevItem.id !== item?.id && (
        <div className="media-wrap media-wrap-prev">
          <MediaBlock
            item={prevItem}
            reportEvent={reportEvent}
            mediaBaseUrl={mediaBaseUrl}
          />
        </div>
      )}
      <div
        key={`${index}-${item.id}`}
        className={item?.type === 'image' ? 'media-wrap media-wrap-image-fade' : 'media-wrap'}
      >
        <MediaBlock
          item={item}
          reportEvent={reportEvent}
          mediaBaseUrl={mediaBaseUrl}
          onReady={clearPrevWhenReady}
          onVideoEnded={item?.type === 'video' ? advance : undefined}
        />
      </div>
      {nextItem && nextItem.type === 'video' && nextItem.id !== item?.id && (
        <NextVideoPreload item={nextItem} mediaBaseUrl={mediaBaseUrl} />
      )}
    </div>
  )
}

function NextVideoPreload({ item, mediaBaseUrl }) {
  const url = (item?.url && item.url.startsWith('/uploads')) ? (mediaBaseUrl || '') + item.url : (item?.url || '')
  if (!url) return null
  const xo = crossOriginForMediaUrl(url)
  return (
    <video
      src={url}
      crossOrigin={xo}
      preload="auto"
      muted
      playsInline
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      aria-hidden
    />
  )
}

function parseContentIdForEvents(id) {
  if (typeof id === 'number' && Number.isFinite(id)) return id
  if (typeof id === 'string' && /^\d+$/.test(id.trim())) return parseInt(id.trim(), 10)
  return null
}

function MediaBlock({ item, reportEvent, mediaBaseUrl, onReady, onVideoEnded }) {
  const hasReported = useRef(false)
  const videoRef = useRef(null)
  const url = (item?.url && item.url.startsWith('/uploads')) ? (mediaBaseUrl || '') + item.url : (item?.url || '')
  const mediaCrossOrigin = crossOriginForMediaUrl(url)
  const contentIdInt = parseContentIdForEvents(item?.id)
  const logId = item?.id ?? item?.url ?? ''

  useEffect(() => {
    if (contentIdInt == null) return
    if (hasReported.current) return
    hasReported.current = true
    reportEvent(contentIdInt, 'impression')
    return () => {
      reportEvent(contentIdInt, 'complete')
    }
  }, [contentIdInt, reportEvent])

  useEffect(() => {
    if (item?.type !== 'video' || !url) return
    const el = videoRef.current
    if (!el) return
    const tryPlay = () => {
      el.play?.().catch(() => {})
    }
    tryPlay()
    el.addEventListener('canplay', tryPlay)
    return () => el.removeEventListener('canplay', tryPlay)
  }, [item?.type, url])

  if (!item) {
    return (
      <div className="zone-placeholder">
        <span>대기 중</span>
      </div>
    )
  }

  if (item.type === 'video') {
    if (!url) {
      return (
        <div className="zone-placeholder">
          <span>동영상 URL 없음</span>
        </div>
      )
    }
    return (
      <video
        ref={videoRef}
        className="media media-video"
        src={url}
        crossOrigin={mediaCrossOrigin}
        autoPlay
        muted
        playsInline
        preload="auto"
        onCanPlay={() => onReady?.()}
        onLoadedData={() => onReady?.()}
        onPlay={() => onReady?.()}
        onEnded={() => onVideoEnded?.()}
        onError={() => {
          if (contentIdInt != null) reportEvent(contentIdInt, 'error')
          onVideoEnded?.()
        }}
      />
    )
  }

  if (item.type === 'image') {
    if (!url) {
      return (
        <div className="zone-placeholder">
          <span>이미지 URL 없음</span>
        </div>
      )
    }
    return (
      <img
        className="media media-image"
        src={url}
        crossOrigin={mediaCrossOrigin}
        alt=""
        onLoad={() => onReady?.()}
        onError={() => {
          logMediaLoadFailure('image', logId, url)
          if (contentIdInt != null) reportEvent(contentIdInt, 'error')
        }}
      />
    )
  }

  if (item.type === 'html') {
    if (!url) {
      return (
        <div className="zone-placeholder">
          <span>HTML URL 없음</span>
        </div>
      )
    }
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
