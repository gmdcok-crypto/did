import { useEffect, useState, useRef } from 'react'
import { api, getToken, getLiveViewWsUrl, API_BASE, getUploadsOrigin } from '../lib/api'
import { subscribeCmsDeviceEvents, CMS_SSE_DEVICE_LIST, CMS_SSE_DASHBOARD } from '../lib/cmsSse'
import { formatKstDateTime } from '../lib/datetimeKst'
import { useAuth } from '../lib/auth'

/** 플레이어가 보낸 JSON 매니페스트(재생 URL) — 캡처 없음 */
function LiveStreamManifestView({ manifest }) {
  const layout = manifest?.layout_id || 'full'
  const zones = Array.isArray(manifest?.zones) ? manifest.zones : []
  const splitV = layout === 'split_v'
  if (zones.length === 0) {
    return (
      <div className="live-screen-modal-stream live-screen-modal-stream-empty">
        <p>재생 중인 존이 없습니다. 스케줄·콘텐츠를 확인하세요.</p>
      </div>
    )
  }
  return (
    <div
      className="live-screen-modal-stream"
      style={{
        display: 'grid',
        gap: 0,
        minHeight: 'min(70vh, 520px)',
        background: '#0f0f10',
        ...(splitV
          ? {
              gridTemplateRows: zones.map((z) => `minmax(0,${Number(z.ratio) > 0 ? z.ratio : 1}fr)`).join(' '),
              gridTemplateColumns: 'minmax(0,1fr)',
            }
          : {
              gridTemplateColumns: zones.map((z) => `minmax(0,${Number(z.ratio) > 0 ? z.ratio : 1}fr)`).join(' '),
              gridTemplateRows: 'minmax(0,1fr)',
            }),
      }}
    >
      {zones.map((z) => (
        <div key={String(z.id)} className="live-screen-zone">
          <LiveZoneMedia current={z.current} />
        </div>
      ))}
    </div>
  )
}

/** 실시간 화면 타임아웃 시 표시할 원인 안내 (수집된 진단 기준) */
function buildLiveScreenStallMessage(d) {
  const x = d || {}
  const lines = []
  if (x.redisConfigured === false) {
    lines.push(
      '[환경] Redis(REDIS_URL) 미설정 — API를 여러 인스턴스로 띄우면 플레이어·CMS가 서로 다른 서버에 붙어 스트림이 안 올 수 있습니다.',
    )
  } else if (x.redisPingOk === false) {
    lines.push(`[Redis] 연결/핑 실패: ${x.redisDetail || '—'} (멀티 인스턴스 실시간 화면에 필요)`)
  } else if (x.redisPingOk === true) {
    lines.push('[Redis] 핑 성공')
  }
  if (x.redisHealthHttpStatus != null && x.redisHealthHttpStatus >= 400) {
    lines.push(`[Redis] 헬스 HTTP ${x.redisHealthHttpStatus} — ${x.redisHealthError || '응답 오류'}`)
  }
  if (x.redisPingOk == null && x.redisConfigured == null && !x.redisHealthSkipped) {
    lines.push(
      '[Redis] 헬스 미확인 — /api/health/live-screen 또는 /health/live-screen 을 불러오지 못했거나 아직 응답 전입니다.',
    )
  }
  if (x.wsError) {
    lines.push('[WebSocket] 연결 오류 이벤트 — wss 차단·프록시·URL을 확인하세요.')
  } else if (!x.wsOpen) {
    lines.push('[WebSocket] 세션 동안 open 이벤트 없음 — 연결이 막혔거나 토큰/티켓 불일치로 바로 닫혔을 수 있습니다.')
  } else if (x.wsOpen && (x.wsMsg || 0) < 1) {
    lines.push('[WebSocket] 연결은 됐으나 서버에서 메시지(매니페스트/JPEG) 없음')
  } else if (x.wsOpen && (x.wsMsg || 0) >= 1) {
    lines.push(
      '[WebSocket] 메시지는 수신했으나 화면으로 인식되지 않음 — JSON이 아니거나 매니페스트 형식이 아닐 수 있음',
    )
  }
  if (x.wsCloseCode && x.wsCloseCode !== 1000) {
    const hint =
      x.wsCloseCode === 4401
        ? '(인증 실패)'
        : x.wsCloseCode === 4403
          ? '(티켓·세션 불일치 — 새로 요청하거나 플레이어가 같은 기기인지 확인)'
          : ''
    lines.push(`[WebSocket] 종료 코드 ${x.wsCloseCode} ${hint}`)
  }
  const hm = x.httpManifestStatus
  const hf = x.httpFrameStatus
  if (hm != null) {
    if (hm === 404) {
      lines.push('[HTTP 매니페스트] 아직 없음(404) — 플레이어가 실시간 송신을 시작하지 않았거나 다른 API 인스턴스일 수 있음')
    } else if (hm === 200) {
      lines.push('[HTTP 매니페스트] 200 — 데이터는 있는데 WebSocket만 안 오면 프록시가 WS 업그레이드를 막는지 확인')
    }
  }
  if (hf != null && hf === 404) {
    lines.push('[HTTP JPEG] 없음(404) — 매니페스트만 쓰는 경우 정상일 수 있음')
  }
  if (lines.length === 0) {
    lines.push('[진단] 위 분기에 안 걸림 — 아래 raw 확인')
  }
  lines.push('— 위 항목으로 원인을 좁혀 보세요.')
  let raw = ''
  try {
    raw = JSON.stringify({
      v: 2,
      redisConfigured: x.redisConfigured,
      redisPingOk: x.redisPingOk,
      redisDetail: x.redisDetail,
      redisHealthHttpStatus: x.redisHealthHttpStatus,
      redisHealthError: x.redisHealthError,
      wsOpen: x.wsOpen,
      wsMsg: x.wsMsg,
      wsError: x.wsError,
      wsCloseCode: x.wsCloseCode,
      httpManifestStatus: x.httpManifestStatus,
      httpFrameStatus: x.httpFrameStatus,
    })
  } catch (_) {
    raw = '(raw 직렬화 실패)'
  }
  if (raw.length > 420) raw = `${raw.slice(0, 420)}…`
  lines.push(`[진단 raw] ${raw}`)
  return lines.join('\n')
}

function LiveZoneMedia({ current }) {
  if (!current?.url) {
    return <div className="live-screen-zone-placeholder">대기 중</div>
  }
  const { type, url } = current
  if (type === 'video') {
    return (
      <video
        className="live-screen-zone-media"
        src={url}
        autoPlay
        muted
        playsInline
        controls
      />
    )
  }
  if (type === 'image') {
    return <img className="live-screen-zone-media" src={url} alt="" decoding="async" />
  }
  if (type === 'html') {
    return <iframe className="live-screen-zone-html" src={url} title="" />
  }
  return <div className="live-screen-zone-placeholder">지원하지 않는 타입</div>
}

export default function Devices() {
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', location: '', group_id: '' })
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [regAuthCode, setRegAuthCode] = useState('')
  const [regUsesDatabase, setRegUsesDatabase] = useState(false)
  const [regLoading, setRegLoading] = useState(false)
  const [regSaving, setRegSaving] = useState(false)
  const [liveModal, setLiveModal] = useState({
    open: false,
    title: '',
    loading: false,
    error: null,
    imageSrc: null,
    /** 실시간 화면 요청 시 목록의 device_id(UUID) — 플레이어 localStorage 와 비교 안내용 */
    liveDeviceId: '',
    liveDevicePk: null,
    ticket: null,
    prevBlobUrl: null,
    /** @type {null | { t: string, v?: number, layout_id?: string, zones?: Array<{ id: string, ratio?: number, current: null | { type: string, url: string } }> }} */
    liveManifest: null,
  })
  const livePollAbortRef = useRef(0)
  const liveStallTimerRef = useRef(null)
  /** 실시간 모달 세션별 진단(타임아웃 메시지용) */
  const liveDiagRef = useRef({
    redisConfigured: null,
    redisPingOk: null,
    redisDetail: null,
    wsOpen: false,
    wsError: false,
    wsMsg: 0,
    wsCloseCode: null,
    httpManifestStatus: null,
    httpFrameStatus: null,
  })

  const loadRegistrationCode = () => {
    if (user?.role !== 'admin') return
    setRegLoading(true)
    api('/settings/device-registration')
      .then((data) => {
        setRegAuthCode(data?.auth_code ?? '')
        setRegUsesDatabase(!!data?.uses_database)
      })
      .catch(() => {
        setRegAuthCode('')
        setRegUsesDatabase(false)
      })
      .finally(() => setRegLoading(false))
  }

  useEffect(() => {
    loadRegistrationCode()
  }, [user?.role])

  const saveRegistrationCode = async (e) => {
    e?.preventDefault?.()
    if (user?.role !== 'admin') return
    setRegSaving(true)
    try {
      const data = await api('/settings/device-registration', {
        method: 'PUT',
        body: JSON.stringify({ auth_code: regAuthCode }),
      })
      setRegAuthCode(data?.auth_code ?? '')
      setRegUsesDatabase(!!data?.uses_database)
    } catch (err) {
      alert(err?.message || '저장에 실패했습니다.')
    } finally {
      setRegSaving(false)
    }
  }

  const clearRegistrationOverride = async () => {
    if (!window.confirm('DB에 저장된 코드를 지우고 서버 환경 변수의 기본값을 쓰시겠습니까?')) return
    setRegSaving(true)
    try {
      const data = await api('/settings/device-registration', {
        method: 'PUT',
        body: JSON.stringify({ auth_code: '' }),
      })
      setRegAuthCode(data?.auth_code ?? '')
      setRegUsesDatabase(!!data?.uses_database)
    } catch (err) {
      alert(err?.message || '초기화에 실패했습니다.')
    } finally {
      setRegSaving(false)
    }
  }

  const load = () => {
    setLoading(true)
    Promise.all([api('/devices'), api('/devices/groups')])
      .then(([devices, grps]) => {
        setList(devices)
        setGroups(grps || [])
      })
      .catch(() => {
        setList([])
        setGroups([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (selectedGroupId != null && !groups.some((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(null)
      setNewGroupName('')
    }
  }, [groups, selectedGroupId])

  // SSE: 디바이스 등록·오프라인·대시보드 연동 이벤트 → 목록 갱신 (끊기면 자동 재연결)
  useEffect(() => {
    return subscribeCmsDeviceEvents((msg) => {
      if (msg === CMS_SSE_DEVICE_LIST || msg === CMS_SSE_DASHBOARD) load()
    })
  }, [])

  const getGroupName = (groupId) => {
    if (groupId == null) return '-'
    const g = groups.find((x) => x.id === groupId)
    return g ? g.name : `#${groupId}`
  }

  const startEdit = (d) => {
    setEditingId(d.id)
    setEditForm({
      name: d.name || '',
      location: d.location || '',
      group_id: d.group_id != null ? String(d.group_id) : '',
    })
  }

  const saveEdit = async () => {
    if (editingId == null) return
    try {
      await api(`/devices/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          location: editForm.location,
          group_id: editForm.group_id === '' ? null : Number(editForm.group_id),
        }),
      })
      setEditingId(null)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const deleteDevice = async (d) => {
    if (!window.confirm(`"${d.name || d.device_id}" 디바이스를 목록에서 삭제할까요?`)) return
    try {
      await api(`/devices/${d.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      const msg = e?.message || String(e)
      if (msg === 'Failed to fetch' || msg.includes('fetch')) {
        alert('삭제 요청이 실패했습니다. API 서버 연결을 확인해 주세요.')
      } else {
        alert(msg)
      }
    }
  }

  const addGroup = async (e) => {
    e.preventDefault()
    const name = newGroupName.trim()
    if (!name) return
    try {
      await api('/devices/groups', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setNewGroupName('')
      setSelectedGroupId(null)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const saveSelectedGroup = async () => {
    if (selectedGroupId == null) {
      alert('수정할 그룹을 아래 목록에서 먼저 선택하세요.')
      return
    }
    const name = newGroupName.trim()
    if (!name) return
    try {
      await api(`/devices/groups/${selectedGroupId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const deleteSelectedGroup = async () => {
    if (selectedGroupId == null) {
      alert('삭제할 그룹을 아래 목록에서 먼저 선택하세요.')
      return
    }
    const g = groups.find((x) => x.id === selectedGroupId)
    const label = g?.name || `#${selectedGroupId}`
    if (!window.confirm(`"${label}" 그룹을 삭제할까요? 소속 디바이스는 그룹 해제됩니다.`)) return
    try {
      await api(`/devices/groups/${selectedGroupId}`, { method: 'DELETE' })
      setSelectedGroupId(null)
      setNewGroupName('')
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const closeLiveModal = () => {
    livePollAbortRef.current += 1
    const pk = liveModal.liveDevicePk
    setLiveModal((m) => {
      if (m.prevBlobUrl) URL.revokeObjectURL(m.prevBlobUrl)
      return {
        open: false,
        title: '',
        loading: false,
        error: null,
        imageSrc: null,
        liveDeviceId: '',
        liveDevicePk: null,
        ticket: null,
        prevBlobUrl: null,
        liveManifest: null,
      }
    })
    if (pk != null) {
      api(`/devices/${pk}/live-screen/stop`, { method: 'POST' }).catch(() => {})
    }
  }

  /** WebSocket JPEG 스트리밍 — ticket·devicePk 가 준비되면 연결 */
  useEffect(() => {
    const open = liveModal.open
    const ticket = liveModal.ticket
    const pk = liveModal.liveDevicePk
    if (!open || !ticket || pk == null) return
    const token = getToken()
    if (!token) {
      setLiveModal((m) => ({ ...m, loading: false, error: '로그인이 필요합니다.' }))
      return
    }
    liveDiagRef.current = {
      redisConfigured: null,
      redisPingOk: null,
      redisDetail: null,
      wsOpen: false,
      wsError: false,
      wsMsg: 0,
      wsCloseCode: null,
      httpManifestStatus: null,
      httpFrameStatus: null,
      redisHealthSkipped: false,
      redisHealthHttpStatus: null,
      redisHealthError: null,
    }
    const tryHealth = async (url) => {
      const r = await fetch(url, { cache: 'no-store' })
      liveDiagRef.current.redisHealthHttpStatus = r.status
      if (!r.ok) {
        liveDiagRef.current.redisHealthError = `HTTP ${r.status}`
        return null
      }
      return r.json()
    }
    ;(async () => {
      try {
        let j = null
        try {
          j = await tryHealth(`${API_BASE}/health/live-screen`)
        } catch (_) {
          j = null
        }
        if (!j && getUploadsOrigin()) {
          const o = getUploadsOrigin().replace(/\/$/, '')
          try {
            j = await tryHealth(`${o}/health/live-screen`)
          } catch (_) {
            j = null
          }
        }
        if (j) {
          liveDiagRef.current.redisConfigured = j?.redis_configured
          liveDiagRef.current.redisPingOk = j?.redis_ping_ok
          liveDiagRef.current.redisDetail = j?.detail ?? null
        }
      } catch (e) {
        liveDiagRef.current.redisHealthError = String(e?.message || e || 'fetch 실패')
      }
    })()
    if (!getUploadsOrigin() && !String(API_BASE || '').trim()) {
      liveDiagRef.current.redisHealthSkipped = true
    }
    const wsUrl = getLiveViewWsUrl(pk, ticket, token)
    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => {
      liveDiagRef.current.wsOpen = true
    }
    const stallMs = 45000
    const stallTimer = setTimeout(() => {
      setLiveModal((m) => {
        if (!m.open || !m.loading || m.imageSrc || m.liveManifest) return m
        return {
          ...m,
          loading: false,
          error: buildLiveScreenStallMessage(liveDiagRef.current),
        }
      })
    }, stallMs)
    liveStallTimerRef.current = stallTimer
    // onopen 에서 loading 을 끄면 첫 프레임 전에 본문이 비어 "닫기"만 보임 → 첫 JPEG 수신 시에만 로딩 해제
    ws.onmessage = (ev) => {
      liveDiagRef.current.wsMsg = (liveDiagRef.current.wsMsg || 0) + 1
      clearTimeout(stallTimer)
      liveStallTimerRef.current = null
      let rawText = null
      if (typeof ev.data === 'string') rawText = ev.data
      else if (ev.data instanceof ArrayBuffer) {
        const s = new TextDecoder('utf-8').decode(ev.data).trim()
        if (s.startsWith('{')) rawText = s
      }
      if (rawText) {
        try {
          const j = JSON.parse(rawText)
          if (j && j.t === 'manifest') {
            setLiveModal((m) => ({ ...m, liveManifest: j, loading: false, error: null }))
            return
          }
        } catch (_) {}
        return
      }
      const blob = new Blob([ev.data], { type: 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      setLiveModal((m) => {
        if (m.prevBlobUrl) URL.revokeObjectURL(m.prevBlobUrl)
        return { ...m, imageSrc: url, prevBlobUrl: url, loading: false, error: null }
      })
    }
    ws.onerror = () => {
      liveDiagRef.current.wsError = true
      clearTimeout(stallTimer)
      liveStallTimerRef.current = null
      setLiveModal((m) => ({
        ...m,
        loading: false,
        error:
          m.error ||
          `WebSocket 오류. ${buildLiveScreenStallMessage(liveDiagRef.current)}`,
      }))
    }
    ws.onclose = (ev) => {
      liveDiagRef.current.wsCloseCode = ev?.code ?? null
      clearTimeout(stallTimer)
      liveStallTimerRef.current = null
      setLiveModal((m) => {
        if (!m.open) return m
        if (m.imageSrc || m.liveManifest) return m
        return {
          ...m,
          loading: false,
          error:
            m.error ||
            `스트림 종료(code ${ev?.code ?? '—'}). ${buildLiveScreenStallMessage(liveDiagRef.current)}`,
        }
      })
    }
    // effect 재실행·Strict Mode 시 이미지를 지우지 않음(닫기만 보이는 현상 방지). 연결만 끊고 blob 은 closeLiveModal 에서 정리
    return () => {
      clearTimeout(stallTimer)
      liveStallTimerRef.current = null
      try {
        ws.close()
      } catch (_) {}
    }
  }, [liveModal.open, liveModal.ticket, liveModal.liveDevicePk])

  /** wss 차단·프록시 이슈 시에도 마지막 프레임을 HTTP로 폴링 */
  useEffect(() => {
    const open = liveModal.open
    const ticket = liveModal.ticket
    const pk = liveModal.liveDevicePk
    const imageSrc = liveModal.imageSrc
    const liveManifest = liveModal.liveManifest
    if (!open || !ticket || pk == null || imageSrc || liveManifest) return
    const token = getToken()
    if (!token) return

    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      try {
        const qs = new URLSearchParams({ ticket })
        const rMan = await fetch(`${API_BASE}/devices/${pk}/live-screen/manifest?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        liveDiagRef.current.httpManifestStatus = rMan.status
        if (rMan.ok && !cancelled) {
          const j = await rMan.json()
          if (j?.t === 'manifest') {
            if (liveStallTimerRef.current) {
              clearTimeout(liveStallTimerRef.current)
              liveStallTimerRef.current = null
            }
            setLiveModal((m) => ({ ...m, liveManifest: j, loading: false, error: null }))
            return
          }
        }
        const res = await fetch(`${API_BASE}/devices/${pk}/live-screen/frame?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        liveDiagRef.current.httpFrameStatus = res.status
        if (!res.ok || cancelled) return
        const buf = await res.arrayBuffer()
        if (buf.byteLength < 32 || cancelled) return
        const blob = new Blob([buf], { type: 'image/jpeg' })
        const url = URL.createObjectURL(blob)
        if (liveStallTimerRef.current) {
          clearTimeout(liveStallTimerRef.current)
          liveStallTimerRef.current = null
        }
        setLiveModal((m) => {
          if (!m.open || cancelled) {
            URL.revokeObjectURL(url)
            return m
          }
          if (m.prevBlobUrl) URL.revokeObjectURL(m.prevBlobUrl)
          return { ...m, imageSrc: url, prevBlobUrl: url, loading: false, error: null }
        })
      } catch (_) {}
    }
    poll()
    const t = setInterval(poll, 600)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [liveModal.open, liveModal.ticket, liveModal.liveDevicePk, liveModal.imageSrc, liveModal.liveManifest])

  const openLiveScreen = async (d) => {
    const myAbort = (livePollAbortRef.current += 1)
    setLiveModal({
      open: true,
      title: d.name || d.device_id,
      loading: true,
      error: null,
      imageSrc: null,
      liveDeviceId: String(d.device_id ?? '').trim(),
      liveDevicePk: d.id,
      ticket: null,
      prevBlobUrl: null,
      liveManifest: null,
    })
    try {
      const req = await api(`/devices/${d.id}/live-screen/request`, { method: 'POST' })
      const ticket = String(req?.ticket ?? '').trim()
      if (!ticket) throw new Error('요청 티켓을 받지 못했습니다.')
      if (livePollAbortRef.current !== myAbort) return
      setLiveModal((m) => ({ ...m, ticket, loading: true }))
    } catch (e) {
      if (livePollAbortRef.current !== myAbort) return
      setLiveModal((m) => ({
        ...m,
        loading: false,
        error: `${e?.message || '요청 실패'} (요청 device_id=${String(d.device_id ?? '').trim() || '—'})`,
      }))
    }
  }

  if (loading) return <div className="loading">로딩 중...</div>

  const defaultGroup = groups.find((g) => g.name === '기본')
  const defaultGroupId = defaultGroup?.id ?? 1

  return (
    <div className="page">
      <h1>디바이스</h1>
      <p className="small" style={{ color: '#666', marginBottom: '1rem' }}>
        마지막 접속 시각은 한국 표준시(KST)로 표시됩니다.
      </p>

      <div className="devices-top-row">
        {user?.role === 'admin' && (
          <section className="card section devices-section-reg">
            <h2>디바이스 등록 인증코드</h2>
            <form className="form-inline devices-reg-form" onSubmit={saveRegistrationCode}>
              <input
                type="text"
                autoComplete="off"
                value={regAuthCode}
                onChange={(e) => setRegAuthCode(e.target.value)}
                placeholder="인증코드"
                disabled={regLoading}
              />
              <button type="submit" className="btn btn-primary" disabled={regSaving || regLoading}>
                {regSaving ? '저장 중…' : '저장'}
              </button>
              {regUsesDatabase && (
                <button type="button" className="btn" onClick={clearRegistrationOverride} disabled={regSaving || regLoading}>
                  DB 초기화
                </button>
              )}
            </form>
          </section>
        )}

        <section className="card section devices-section-groups">
          <h2>디바이스 그룹</h2>
          <form className="devices-groups-toolbar" onSubmit={addGroup}>
            <span className="group-id devices-groups-default-label">기본 ID: {defaultGroupId}</span>
            <input
              type="text"
              className="input-sm devices-groups-toolbar-input"
              placeholder="그룹 이름"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <button type="submit" className="btn btn-sm">
              추가
            </button>
            <button type="button" className="btn btn-sm" onClick={saveSelectedGroup}>
              수정
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={deleteSelectedGroup}>
              삭제
            </button>
          </form>
          <ul className="group-list group-list-selectable">
            {groups.map((g) => (
              <li
                key={g.id}
                role="button"
                tabIndex={0}
                className={selectedGroupId === g.id ? 'is-selected' : ''}
                onClick={() => {
                  setSelectedGroupId(g.id)
                  setNewGroupName(g.name)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedGroupId(g.id)
                    setNewGroupName(g.name)
                  }
                }}
              >
                <span className="group-name">{g.name}</span>
                <span className="group-id">ID: {g.id}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 디바이스 목록 */}
      <section className="card section">
        <h2>디바이스 목록</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>디바이스 ID</th>
                <th>이름</th>
                <th>위치</th>
                <th>그룹</th>
                <th>상태</th>
                <th>마지막 접속</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={8}>—</td>
                </tr>
              ) : (
                list.map((d) => (
                  <tr key={d.id}>
                    {editingId === d.id ? (
                      <>
                        <td>{d.id}</td>
                        <td className="mono">{d.device_id}</td>
                        <td>
                          <input
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            className="input-sm"
                          />
                        </td>
                        <td>
                          <input
                            value={editForm.location}
                            onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                            className="input-sm"
                          />
                        </td>
                        <td>
                          <select
                            value={editForm.group_id}
                            onChange={(e) => setEditForm((f) => ({ ...f, group_id: e.target.value }))}
                            className="input-sm"
                          >
                            <option value="">없음</option>
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td><span className={`status status-${d.status}`}>{d.status}</span></td>
                        <td>{d.last_seen ? formatKstDateTime(d.last_seen) : '-'}</td>
                        <td>
                          <button type="button" className="btn btn-sm btn-primary" onClick={saveEdit}>
                            저장
                          </button>
                          <button type="button" className="btn btn-sm" onClick={cancelEdit}>
                            취소
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{d.id}</td>
                        <td className="mono">{d.device_id}</td>
                        <td>{d.name}</td>
                        <td>{d.location}</td>
                        <td>{getGroupName(d.group_id)}</td>
                        <td><span className={`status status-${d.status}`}>{d.status}</span></td>
                        <td>{d.last_seen ? formatKstDateTime(d.last_seen) : '-'}</td>
                        <td>
                          <button type="button" className="btn btn-sm" onClick={() => openLiveScreen(d)}>
                            실시간 화면
                          </button>
                          <button type="button" className="btn btn-sm" onClick={() => startEdit(d)}>
                            수정
                          </button>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteDevice(d)}>
                            삭제
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {liveModal.open && (
        <div
          className="live-screen-overlay"
          role="presentation"
          onClick={closeLiveModal}
        >
          <div
            className="live-screen-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-screen-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="live-screen-modal-head">
              <h3 id="live-screen-title">{liveModal.title}</h3>
              <button type="button" className="btn btn-sm" onClick={closeLiveModal}>
                닫기
              </button>
            </div>
            {liveModal.loading && (
              <p className="live-screen-modal-status">실시간 화면을 불러오는 중입니다…</p>
            )}
            {liveModal.error && <p className="live-screen-modal-error">{liveModal.error}</p>}
            {liveModal.liveManifest && (
              <LiveStreamManifestView manifest={liveModal.liveManifest} />
            )}
            {liveModal.imageSrc && !liveModal.liveManifest && (
              <div className="live-screen-modal-img-wrap">
                <img
                  src={liveModal.imageSrc}
                  alt="실시간 화면 스트림"
                  decoding="async"
                  onError={() => {
                    setLiveModal((m) =>
                      m.imageSrc
                        ? {
                            ...m,
                            loading: false,
                            imageSrc: null,
                            error:
                              '이미지를 표시하지 못했습니다. WebSocket(wss)이 차단되지 않았는지 확인하세요.',
                          }
                        : m,
                    )
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
