import { useEffect, useState, Fragment } from 'react'
import { api } from '../lib/api'

const TABS = [
  { id: 'list', label: '목록' },
  { id: 'add', label: '추가' },
]

export default function Campaigns() {
  const [activeTab, setActiveTab] = useState('list')
  const [list, setList] = useState([])
  const [contents, setContents] = useState([])
  const [loading, setLoading] = useState(true)
  const [addForm, setAddForm] = useState({
    name: '',
    start_at: '',
    end_at: '',
    priority: 0,
    content_ids: [],
  })
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({
    name: '',
    start_at: '',
    end_at: '',
    priority: 0,
    content_ids: [],
  })
  const [editLoading, setEditLoading] = useState(false)

  const loadCampaigns = () => {
    api('/campaigns')
      .then(setList)
      .catch(() => setList([]))
  }

  const loadContents = () => {
    api('/contents')
      .then(setContents)
      .catch(() => setContents([]))
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([api('/campaigns').catch(() => []), api('/contents').catch(() => [])])
      .then(([campaigns, contentsList]) => {
        setList(campaigns)
        setContents(contentsList)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleAddCampaign = async (e) => {
    e.preventDefault()
    const { name, start_at, end_at, priority, content_ids } = addForm
    if (!name.trim()) {
      alert('캠페인 이름을 입력하세요.')
      return
    }
    if (!start_at || !end_at) {
      alert('시작일과 종료일을 입력하세요.')
      return
    }
    setSubmitting(true)
    try {
      await api('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          start_at: new Date(start_at).toISOString(),
          end_at: new Date(end_at).toISOString(),
          priority: parseInt(priority, 10) || 0,
          content_ids: Array.isArray(content_ids) ? content_ids : [],
        }),
      })
      setAddForm({ name: '', start_at: '', end_at: '', priority: 0, content_ids: [] })
      loadCampaigns()
      setActiveTab('list')
    } catch (e) {
      alert(e.message || '캠페인 추가에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleContentId = (id) => {
    setAddForm((f) => ({
      ...f,
      content_ids: f.content_ids.includes(id)
        ? f.content_ids.filter((x) => x !== id)
        : [...f.content_ids, id],
    }))
  }

  const toggleContentIdForEdit = (id) => {
    setEditForm((f) => ({
      ...f,
      content_ids: f.content_ids.includes(id)
        ? f.content_ids.filter((x) => x !== id)
        : [...f.content_ids, id],
    }))
  }

  const startEdit = (c) => {
    setEditLoading(true)
    api(`/campaigns/${c.id}`)
      .then((detail) => {
        const toLocal = (d) => (d ? new Date(d).toISOString().slice(0, 16) : '')
        setEditForm({
          name: detail.name || '',
          start_at: toLocal(detail.start_at),
          end_at: toLocal(detail.end_at),
          priority: detail.priority ?? 0,
          content_ids: Array.isArray(detail.content_ids) ? detail.content_ids : [],
        })
        setEditingId(c.id)
      })
      .catch((e) => alert(e.message || '캠페인 정보를 불러오지 못했습니다.'))
      .finally(() => setEditLoading(false))
  }

  const cancelEdit = () => setEditingId(null)

  const saveCampaign = async () => {
    if (editingId == null) return
    const { name, start_at, end_at, priority, content_ids } = editForm
    if (!name.trim()) {
      alert('이름을 입력하세요.')
      return
    }
    try {
      await api(`/campaigns/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          start_at: new Date(start_at).toISOString(),
          end_at: new Date(end_at).toISOString(),
          priority: parseInt(priority, 10) || 0,
          content_ids: Array.isArray(content_ids) ? content_ids : [],
        }),
      })
      setEditingId(null)
      loadCampaigns()
    } catch (e) {
      alert(e.message || '수정에 실패했습니다.')
    }
  }

  const deleteCampaign = async (c) => {
    if (!window.confirm(`"${c.name}" 캠페인을 삭제할까요?`)) return
    try {
      await api(`/campaigns/${c.id}`, { method: 'DELETE' })
      loadCampaigns()
    } catch (e) {
      alert(e.message || '삭제에 실패했습니다.')
    }
  }

  if (loading && list.length === 0) return <div className="loading">로딩 중...</div>

  return (
    <div className="page">
      <h1>캠페인</h1>

      <div className="tabs">
        <div className="tab-list" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'list' && (
          <div className="tab-panel tab-panel-list" role="tabpanel">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>이름</th>
                    <th>시작</th>
                    <th>종료</th>
                    <th>우선순위</th>
                    <th>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={6}>캠페인이 없습니다. &quot;추가&quot; 탭에서 새 캠페인을 만드세요.</td>
                    </tr>
                  ) : (
                    list.map((c) => (
                      <Fragment key={c.id}>
                        <tr>
                        <td>{c.id}</td>
                        {editingId === c.id ? (
                          <>
                            <td>
                              <input
                                className="input-sm"
                                value={editForm.name}
                                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                              />
                            </td>
                            <td>
                              <input
                                type="datetime-local"
                                className="input-sm"
                                value={editForm.start_at}
                                onChange={(e) => setEditForm((f) => ({ ...f, start_at: e.target.value }))}
                              />
                            </td>
                            <td>
                              <input
                                type="datetime-local"
                                className="input-sm"
                                value={editForm.end_at}
                                onChange={(e) => setEditForm((f) => ({ ...f, end_at: e.target.value }))}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                className="input-sm"
                                style={{ width: '60px' }}
                                value={editForm.priority}
                                onChange={(e) => setEditForm((f) => ({ ...f, priority: parseInt(e.target.value, 10) || 0 }))}
                              />
                            </td>
                            <td>
                              <button type="button" className="btn btn-sm btn-primary" onClick={saveCampaign}>
                                저장
                              </button>
                              <button type="button" className="btn btn-sm" onClick={cancelEdit}>
                                취소
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{c.name}</td>
                            <td>{new Date(c.start_at).toLocaleDateString('ko-KR')}</td>
                            <td>{new Date(c.end_at).toLocaleDateString('ko-KR')}</td>
                            <td>{c.priority}</td>
                            <td>
                              <button type="button" className="btn btn-sm" onClick={() => startEdit(c)} disabled={editLoading}>
                                {editLoading ? '로딩…' : '수정'}
                              </button>
                              <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteCampaign(c)}>
                                삭제
                              </button>
                            </td>
                          </>
                        )}
                        </tr>
                        {editingId === c.id && (
                          <tr>
                            <td colSpan={6} className="table-inline-edit">
                                <div className="form-row" style={{ marginBottom: 0 }}>
                                <label style={{ minWidth: '8rem' }}>사용할 미디어 (선택)</label>
                                <div className="content-check-list" style={{ maxHeight: '120px' }}>
                                  {contents.length === 0 ? (
                                    <span className="muted small">등록된 미디어가 없습니다.</span>
                                  ) : (
                                    contents.map((cont) => (
                                      <label key={cont.id} className="content-check-item">
                                        <input
                                          type="checkbox"
                                          checked={editForm.content_ids.includes(cont.id)}
                                          onChange={() => toggleContentIdForEdit(cont.id)}
                                        />
                                        <span>{cont.name || cont.url || `#${cont.id}`}</span>
                                        <span className="mono small">({cont.type})</span>
                                      </label>
                                    ))
                                  )}
                                </div>
                              </div>
                              <p className="muted small" style={{ marginTop: '0.25rem' }}>재생 순서는 스케줄에서 정합니다.</p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'add' && (
          <div className="tab-panel" role="tabpanel">
            <section className="card section">
              <h2>캠페인 추가</h2>
              <form className="campaign-form-add" onSubmit={handleAddCampaign}>
                <div className="form-row">
                  <label>이름</label>
                  <input
                    type="text"
                    placeholder="캠페인 이름"
                    value={addForm.name}
                    onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label>시작일시</label>
                  <input
                    className="campaign-add-datetime"
                    type="datetime-local"
                    value={addForm.start_at}
                    onChange={(e) => setAddForm((f) => ({ ...f, start_at: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label>종료일시</label>
                  <input
                    className="campaign-add-datetime"
                    type="datetime-local"
                    value={addForm.end_at}
                    onChange={(e) => setAddForm((f) => ({ ...f, end_at: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label>우선순위</label>
                  <input
                    type="number"
                    min={0}
                    value={addForm.priority}
                    onChange={(e) => setAddForm((f) => ({ ...f, priority: parseInt(e.target.value, 10) || 0 }))}
                  />
                  <span className="muted small">숫자가 클수록 우선</span>
                </div>
                <div className="form-row">
                  <label>미디어 (선택)</label>
                  <div className="content-check-list">
                    {contents.length === 0 ? (
                      <p className="muted small">등록된 미디어가 없습니다. 미디어 메뉴에서 먼저 추가하세요.</p>
                    ) : (
                      contents.map((c) => (
                        <label key={c.id} className="content-check-item">
                          <input
                            type="checkbox"
                            checked={addForm.content_ids.includes(c.id)}
                            onChange={() => toggleContentId(c.id)}
                          />
                          <span>{c.name || c.url || `#${c.id}`}</span>
                          <span className="mono small">({c.type})</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <div className="form-row">
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? '등록 중…' : '캠페인 추가'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
