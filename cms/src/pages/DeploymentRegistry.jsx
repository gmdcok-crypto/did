import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

const emptyForm = () => ({
  name: '',
  railway_project_label: '',
  public_url: '',
  mysql_database: '',
  r2_bucket: '',
  r2_public_url: '',
  notes: '',
  sort_order: 0,
})

export default function DeploymentRegistry() {
  const { user, loading: authLoading } = useAuth()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [addForm, setAddForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(emptyForm)

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    api('/deployment-registry')
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch((err) => {
        setList([])
        setLoadError(err?.message || '목록을 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (user?.role === 'admin') {
      load()
    } else {
      setLoading(false)
    }
  }, [load, user?.role])

  if (authLoading) return <div className="loading">로딩 중...</div>
  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  const startEdit = (row) => {
    setEditingId(row.id)
    setEditForm({
      name: row.name || '',
      railway_project_label: row.railway_project_label || '',
      public_url: row.public_url || '',
      mysql_database: row.mysql_database || '',
      r2_bucket: row.r2_bucket || '',
      r2_public_url: row.r2_public_url || '',
      notes: row.notes || '',
      sort_order: row.sort_order ?? 0,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = async () => {
    if (editingId == null) return
    try {
      await api(`/deployment-registry/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          railway_project_label: editForm.railway_project_label || null,
          public_url: editForm.public_url || null,
          mysql_database: editForm.mysql_database || null,
          r2_bucket: editForm.r2_bucket || null,
          r2_public_url: editForm.r2_public_url || null,
          notes: editForm.notes || null,
          sort_order: Number(editForm.sort_order) || 0,
        }),
      })
      setEditingId(null)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const addRow = async (e) => {
    e.preventDefault()
    if (!addForm.name.trim()) {
      alert('이름(고객·프로젝트 표시명)을 입력하세요.')
      return
    }
    try {
      await api('/deployment-registry', {
        method: 'POST',
        body: JSON.stringify({
          name: addForm.name.trim(),
          railway_project_label: addForm.railway_project_label || null,
          public_url: addForm.public_url || null,
          mysql_database: addForm.mysql_database || null,
          r2_bucket: addForm.r2_bucket || null,
          r2_public_url: addForm.r2_public_url || null,
          notes: addForm.notes || null,
          sort_order: Number(addForm.sort_order) || 0,
        }),
      })
      setAddForm(emptyForm())
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  const removeRow = async (row) => {
    if (!window.confirm(`「${row.name}」 항목을 삭제할까요?`)) return
    try {
      await api(`/deployment-registry/${row.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  if (loading && list.length === 0 && !loadError) return <div className="loading">로딩 중...</div>

  return (
    <div className="page">
      <h1>배포 레지스트리</h1>
      {loadError && (
        <div className="error" style={{ maxWidth: '52rem', marginBottom: '1rem' }}>
          {loadError}
          <br />
          <span className="muted small">
            백엔드가 최신인지 확인하세요. 배포 후에도 동일하면 브라우저 개발자 도구 → Network에서{' '}
            <code>/api/deployment-registry</code> 응답을 확인하세요.
          </span>
        </div>
      )}
      <p className="muted small" style={{ maxWidth: '52rem', marginBottom: '1.25rem' }}>
        여러 Railway 프로젝트·MySQL DB명·R2 버킷·공개 URL을 한곳에 기록합니다. DB 비밀번호·R2 시크릿은 Railway·Cloudflare에만 두고 여기에는 적지
        마세요. 데이터는 <strong>이 CMS가 붙은 DB</strong>에 저장됩니다(운영용 본사 인스턴스에서만 쓰는 것을 권장).
      </p>

      <section className="card section">
        <h2>항목 추가</h2>
        <form onSubmit={addRow} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="form-row">
            <label>
              이름
              <input
                type="text"
                className="input-sm"
                placeholder="예: smdv, A사 현장"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label>
              정렬
              <input
                type="number"
                className="input-sm"
                style={{ maxWidth: '6rem' }}
                value={addForm.sort_order}
                onChange={(e) => setAddForm((f) => ({ ...f, sort_order: e.target.value }))}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Railway 프로젝트(표시)
              <input
                type="text"
                className="input-sm"
                placeholder="예: smdv"
                value={addForm.railway_project_label}
                onChange={(e) => setAddForm((f) => ({ ...f, railway_project_label: e.target.value }))}
              />
            </label>
            <label>
              공개 URL
              <input
                type="url"
                className="input-sm mono"
                placeholder="https://….up.railway.app"
                value={addForm.public_url}
                onChange={(e) => setAddForm((f) => ({ ...f, public_url: e.target.value }))}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              MySQL DB명
              <input
                type="text"
                className="input-sm mono"
                placeholder="예: railway"
                value={addForm.mysql_database}
                onChange={(e) => setAddForm((f) => ({ ...f, mysql_database: e.target.value }))}
              />
            </label>
            <label>
              R2 버킷
              <input
                type="text"
                className="input-sm mono"
                value={addForm.r2_bucket}
                onChange={(e) => setAddForm((f) => ({ ...f, r2_bucket: e.target.value }))}
              />
            </label>
          </div>
          <label>
            R2 공개 URL
            <input
              type="url"
              className="input-sm mono"
              placeholder="https://pub-….r2.dev"
              value={addForm.r2_public_url}
              onChange={(e) => setAddForm((f) => ({ ...f, r2_public_url: e.target.value }))}
            />
          </label>
          <label>
            메모
            <textarea
              className="input-sm"
              rows={2}
              value={addForm.notes}
              onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <button type="submit" className="btn btn-primary">
            추가
          </button>
        </form>
      </section>

      <section className="card section">
        <h2>목록 ({list.length})</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>이름</th>
                <th>Railway</th>
                <th>공개 URL</th>
                <th>DB명</th>
                <th>R2</th>
                <th>R2 URL</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((row) =>
                editingId === row.id ? (
                  <tr key={row.id} className="table-row-editing">
                    <td colSpan={7} className="table-inline-edit">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div className="form-row">
                          <input
                            type="text"
                            className="input-sm"
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          />
                          <input
                            type="number"
                            className="input-sm"
                            style={{ maxWidth: '5rem' }}
                            title="정렬"
                            value={editForm.sort_order}
                            onChange={(e) => setEditForm((f) => ({ ...f, sort_order: e.target.value }))}
                          />
                        </div>
                        <div className="form-row">
                          <input
                            type="text"
                            className="input-sm"
                            placeholder="Railway 프로젝트"
                            value={editForm.railway_project_label}
                            onChange={(e) => setEditForm((f) => ({ ...f, railway_project_label: e.target.value }))}
                          />
                          <input
                            type="url"
                            className="input-sm mono"
                            placeholder="공개 URL"
                            value={editForm.public_url}
                            onChange={(e) => setEditForm((f) => ({ ...f, public_url: e.target.value }))}
                          />
                        </div>
                        <div className="form-row">
                          <input
                            type="text"
                            className="input-sm mono"
                            placeholder="MySQL DB명"
                            value={editForm.mysql_database}
                            onChange={(e) => setEditForm((f) => ({ ...f, mysql_database: e.target.value }))}
                          />
                          <input
                            type="text"
                            className="input-sm mono"
                            placeholder="R2 버킷"
                            value={editForm.r2_bucket}
                            onChange={(e) => setEditForm((f) => ({ ...f, r2_bucket: e.target.value }))}
                          />
                        </div>
                        <input
                          type="url"
                          className="input-sm mono"
                          placeholder="R2 공개 URL"
                          value={editForm.r2_public_url}
                          onChange={(e) => setEditForm((f) => ({ ...f, r2_public_url: e.target.value }))}
                        />
                        <textarea
                          className="input-sm"
                          rows={2}
                          placeholder="메모"
                          value={editForm.notes}
                          onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                        />
                        <div className="form-row">
                          <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit}>
                            저장
                          </button>
                          <button type="button" className="btn btn-sm" onClick={cancelEdit}>
                            취소
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      <span className="muted small" style={{ marginLeft: '0.35rem' }}>
                        #{row.sort_order}
                      </span>
                    </td>
                    <td>{row.railway_project_label || '—'}</td>
                    <td className="url-cell mono">
                      {row.public_url ? (
                        <a href={row.public_url} target="_blank" rel="noreferrer">
                          {row.public_url}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="mono">{row.mysql_database || '—'}</td>
                    <td className="mono">{row.r2_bucket || '—'}</td>
                    <td className="url-cell mono">
                      {row.r2_public_url ? (
                        <a href={row.r2_public_url} target="_blank" rel="noreferrer">
                          {row.r2_public_url}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-sm" onClick={() => startEdit(row)}>
                        수정
                      </button>{' '}
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => removeRow(row)}>
                        삭제
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <p className="muted">등록된 항목이 없습니다.</p>}
      </section>
    </div>
  )
}
