import { useEffect, useState, useRef } from 'react'
import { api, API_BASE, getUploadsOrigin } from '../lib/api'
import { useAuth } from '../lib/auth'

export default function Devices() {
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', location: '', group_id: '' })
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [editingGroupName, setEditingGroupName] = useState('')
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
  })
  const livePollAbortRef = useRef(0)

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

  // SSE: 디바이스 등록/수정 시 서버가 보내는 신호 수신 → 목록 갱신
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/devices/events`)
    es.onmessage = () => load()
    es.onerror = () => es.close()
    return () => es.close()
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
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const startEditGroup = (g) => {
    setEditingGroupId(g.id)
    setEditingGroupName(g.name)
  }

  const saveGroup = async () => {
    if (editingGroupId == null) return
    const name = editingGroupName.trim()
    if (!name) return
    try {
      await api(`/devices/groups/${editingGroupId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
      setEditingGroupId(null)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const cancelEditGroup = () => {
    setEditingGroupId(null)
  }

  const deleteGroup = async (g) => {
    if (!window.confirm(`"${g.name}" 그룹을 삭제할까요? 소속 디바이스는 그룹 해제됩니다.`)) return
    try {
      await api(`/devices/groups/${g.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const closeLiveModal = () => {
    livePollAbortRef.current += 1
    setLiveModal({
      open: false,
      title: '',
      loading: false,
      error: null,
      imageSrc: null,
    })
  }

  const openLiveScreen = async (d) => {
    const myAbort = (livePollAbortRef.current += 1)
    setLiveModal({
      open: true,
      title: d.name || d.device_id,
      loading: true,
      error: null,
      imageSrc: null,
    })
    try {
      const req = await api(`/devices/${d.id}/live-screen/request`, { method: 'POST' })
      const ticket = req?.ticket
      if (!ticket) throw new Error('요청 티켓을 받지 못했습니다.')
      if (livePollAbortRef.current !== myAbort) return
      const deadline = Date.now() + 52000
      while (Date.now() < deadline) {
        if (livePollAbortRef.current !== myAbort) return
        await new Promise((r) => setTimeout(r, 1800))
        const st = await api(`/devices/${d.id}/live-screen/status`)
        if (livePollAbortRef.current !== myAbort) return
        if (st?.last_ticket === ticket && st?.image_url) {
          const src = `${getUploadsOrigin()}${st.image_url}?t=${Date.now()}`
          setLiveModal((m) => ({ ...m, loading: false, imageSrc: src }))
          return
        }
      }
      setLiveModal((m) => ({
        ...m,
        loading: false,
        error:
          '시간 내에 화면을 받지 못했습니다. 기기 전원·네트워크·플레이어 실행을 확인하세요.',
      }))
    } catch (e) {
      if (livePollAbortRef.current !== myAbort) return
      setLiveModal((m) => ({ ...m, loading: false, error: e?.message || '요청 실패' }))
    }
  }

  if (loading) return <div className="loading">로딩 중...</div>

  const defaultGroup = groups.find((g) => g.name === '기본')
  const defaultGroupId = defaultGroup?.id ?? 1

  return (
    <div className="page">
      <h1>디바이스</h1>

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
          <div className="devices-groups-title-row">
            <h2>디바이스 그룹</h2>
            <span className="group-id devices-groups-default-id">기본 ID:{defaultGroupId}</span>
          </div>
          <ul className="group-list">
            {groups.map((g) => (
              <li key={g.id}>
                {editingGroupId === g.id ? (
                  <>
                    <input
                      type="text"
                      className="input-sm"
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveGroup()}
                    />
                    <button type="button" className="btn btn-sm btn-primary" onClick={saveGroup}>
                      저장
                    </button>
                    <button type="button" className="btn btn-sm" onClick={cancelEditGroup}>
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <span className="group-name">{g.name}</span>
                    <span className="group-id">ID: {g.id}</span>
                    <button type="button" className="btn btn-sm" onClick={() => startEditGroup(g)}>
                      수정
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => deleteGroup(g)}
                    >
                      삭제
                    </button>
                  </>
                )}
              </li>
            ))}
            <li className="group-list-add-row">
              <form onSubmit={addGroup} className="form-inline group-list-add-form">
                <input
                  type="text"
                  className="input-sm"
                  placeholder="그룹 이름"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
                <button type="submit" className="btn btn-sm">
                  추가
                </button>
              </form>
            </li>
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
                        <td>{d.last_seen ? new Date(d.last_seen).toLocaleString('ko-KR') : '-'}</td>
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
                        <td>{d.last_seen ? new Date(d.last_seen).toLocaleString('ko-KR') : '-'}</td>
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
            {liveModal.loading && <p className="live-screen-modal-status">기기에서 화면을 가져오는 중…</p>}
            {liveModal.error && <p className="live-screen-modal-error">{liveModal.error}</p>}
            {liveModal.imageSrc && (
              <div className="live-screen-modal-img-wrap">
                <img src={liveModal.imageSrc} alt="디바이스 화면 캡처" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
