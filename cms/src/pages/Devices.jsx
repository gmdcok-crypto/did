import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function Devices() {
  const [list, setList] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', location: '', group_id: '' })
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [editingGroupName, setEditingGroupName] = useState('')

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
    const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : 'http://localhost:8000/api')
    const es = new EventSource(`${apiBase}/devices/events`)
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
        alert('삭제 요청이 실패했습니다. 백엔드(http://localhost:8000)가 실행 중인지 확인해 주세요.')
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

  if (loading) return <div className="loading">로딩 중...</div>

  return (
    <div className="page">
      <h1>디바이스</h1>

      {/* 디바이스 그룹 */}
      <section className="card section">
        <h2>디바이스 그룹</h2>
        <ul className="group-list">
          {groups.length === 0 ? (
            <li className="muted">그룹이 없습니다. 아래에서 추가하세요.</li>
          ) : (
            groups.map((g) => (
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
            ))
          )}
        </ul>
        <form onSubmit={addGroup} className="form-inline">
          <input
            type="text"
            placeholder="그룹 이름"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            그룹 추가
          </button>
        </form>
      </section>

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
                  <td colSpan={8}>등록된 디바이스가 없습니다. 플레이어에서 인증코드·이름·위치로 등록하면 여기에 표시됩니다.</td>
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
    </div>
  )
}
