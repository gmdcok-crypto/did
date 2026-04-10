import { useEffect, useState, Fragment } from 'react'
import { api } from '../lib/api'

const TABS = [
  { id: 'list', label: '목록' },
  { id: 'add', label: '추가' },
]

const LAYOUT_OPTIONS = [
  { value: 'full', label: '전체(full)' },
  { value: 'split_h', label: '가로 분할(split_h)' },
  { value: 'split_v', label: '세로 분할(split_v)' },
]

export default function Schedules() {
  const [activeTab, setActiveTab] = useState('list')
  const [list, setList] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [groups, setGroups] = useState([])
  const [contents, setContents] = useState([])
  const [loading, setLoading] = useState(true)
  const [addForm, setAddForm] = useState({
    name: '',
    campaign_id: '',
    device_group_id: '',
    layout_id: 'full',
    layout_config: null,
  })
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({
    name: '',
    campaign_id: '',
    device_group_id: '',
    layout_id: 'full',
    layout_config: null,
    is_active: true,
  })

  const defaultZoneConfig = (layoutId) => {
    if (layoutId === 'split_h' || layoutId === 'split_v') {
      return { zones: [{ id: 'zone_1', ratio: 0.5, content_ids: [] }, { id: 'zone_2', ratio: 0.5, content_ids: [] }] }
    }
    if (layoutId === 'full') {
      return { content_ids: [] }
    }
    return null
  }

  const loadCampaignContentIds = (campaignId) => {
    if (!campaignId) return Promise.resolve([])
    return api(`/campaigns/${campaignId}`).then((d) => d.content_ids || [])
  }

  const moveFullContentOrder = (isAdd, index, delta) => {
    const form = isAdd ? addForm : editForm
    const setForm = isAdd ? setAddForm : setEditForm
    const ids = form.layout_config?.content_ids || []
    const to = index + delta
    if (to < 0 || to >= ids.length) return
    const next = [...ids]
    ;[next[index], next[to]] = [next[to], next[index]]
    setForm((f) => ({ ...f, layout_config: { ...(f.layout_config || {}), content_ids: next } }))
  }

  const toggleFullContent = (isAdd, contentId) => {
    const form = isAdd ? addForm : editForm
    const setForm = isAdd ? setAddForm : setEditForm
    const ids = form.layout_config?.content_ids || []
    const next = ids.includes(contentId) ? ids.filter((x) => x !== contentId) : [...ids, contentId]
    setForm((f) => ({ ...f, layout_config: { ...(f.layout_config || {}), content_ids: next } }))
  }

  const loadSchedules = () => {
    api('/schedules')
      .then(setList)
      .catch(() => setList([]))
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api('/schedules').catch(() => []),
      api('/campaigns').catch(() => []),
      api('/devices/groups').catch(() => []),
      api('/contents').catch(() => []),
    ])
      .then(([schedules, campaignsList, groupsList, contentsList]) => {
        setList(schedules)
        setCampaigns(campaignsList)
        setGroups(groupsList)
        setContents(contentsList || [])
      })
      .finally(() => setLoading(false))
  }, [])

  const handleAddSchedule = async (e) => {
    e.preventDefault()
    const { name, campaign_id, device_group_id, layout_id } = addForm
    if (!name.trim()) {
      alert('스케줄 이름을 입력하세요.')
      return
    }
    const cid = parseInt(campaign_id, 10)
    const gid = parseInt(device_group_id, 10)
    if (!cid || !gid) {
      alert('캠페인과 디바이스 그룹을 선택하세요.')
      return
    }
    setSubmitting(true)
    try {
      await api('/schedules', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          campaign_id: cid,
          device_group_id: gid,
          layout_id: layout_id || 'full',
          layout_config: layout_id === 'full'
            ? { content_ids: addForm.layout_config?.content_ids || [] }
            : (layout_id === 'split_h' || layout_id === 'split_v') ? addForm.layout_config : null,
        }),
      })
      setAddForm({ name: '', campaign_id: '', device_group_id: '', layout_id: 'full', layout_config: null })
      loadSchedules()
      setActiveTab('list')
    } catch (e) {
      alert(e.message || '스케줄 추가에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (s) => {
    setEditingId(s.id)
    const layoutId = s.layout_id || 'full'
    let initialConfig = s.layout_config || defaultZoneConfig(layoutId)
    if (layoutId === 'full' && (!initialConfig?.content_ids || initialConfig.content_ids.length === 0)) {
      loadCampaignContentIds(s.campaign_id).then((ids) => {
        setEditForm((f) => ({ ...f, layout_config: { ...(f.layout_config || {}), content_ids: ids } }))
      })
    }
    setEditForm({
      name: s.name || '',
      campaign_id: String(s.campaign_id || ''),
      device_group_id: String(s.device_group_id || ''),
      layout_id: layoutId,
      layout_config: initialConfig,
      is_active: s.is_active ?? true,
    })
  }

  const toggleZoneContent = (isAdd, zoneIndex, contentId) => {
    const form = isAdd ? addForm : editForm
    const setForm = isAdd ? setAddForm : setEditForm
    const cfg = form.layout_config || defaultZoneConfig(form.layout_id)
    if (!cfg?.zones?.[zoneIndex]) return
    const zones = cfg.zones.map((z, i) => {
      if (i !== zoneIndex) return z
      const ids = z.content_ids || []
      const next = ids.includes(contentId) ? ids.filter((x) => x !== contentId) : [...ids, contentId]
      return { ...z, content_ids: next }
    })
    setForm((f) => ({ ...f, layout_config: { ...cfg, zones } }))
  }

  const cancelEdit = () => setEditingId(null)

  const saveSchedule = async () => {
    if (editingId == null) return
    const { name, campaign_id, device_group_id, layout_id, is_active } = editForm
    if (!name.trim()) {
      alert('이름을 입력하세요.')
      return
    }
    const cid = parseInt(campaign_id, 10)
    const gid = parseInt(device_group_id, 10)
    if (!cid || !gid) {
      alert('캠페인과 디바이스 그룹을 선택하세요.')
      return
    }
    try {
      await api(`/schedules/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          campaign_id: cid,
          device_group_id: gid,
        layout_id: layout_id || 'full',
        layout_config: layout_id === 'full'
          ? { content_ids: editForm.layout_config?.content_ids || [] }
          : (layout_id === 'split_h' || layout_id === 'split_v') ? editForm.layout_config : null,
          is_active: !!is_active,
        }),
      })
      setEditingId(null)
      loadSchedules()
    } catch (e) {
      alert(e.message || '수정에 실패했습니다.')
    }
  }

  const deleteSchedule = async (s) => {
    if (!window.confirm(`"${s.name}" 스케줄을 삭제할까요?`)) return
    try {
      await api(`/schedules/${s.id}`, { method: 'DELETE' })
      loadSchedules()
    } catch (e) {
      alert(e.message || '삭제에 실패했습니다.')
    }
  }

  if (loading && list.length === 0) return <div className="loading">로딩 중...</div>

  return (
    <div className="page">
      <h1>스케줄</h1>

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
                    <th>캠페인 ID</th>
                    <th>디바이스 그룹 ID</th>
                    <th>레이아웃</th>
                    <th>활성</th>
                    <th>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={7}>스케줄이 없습니다. &quot;추가&quot; 탭에서 새 스케줄을 만드세요.</td>
                    </tr>
                  ) : (
                    list.map((s) => (
                      <Fragment key={s.id}>
                        <tr className={editingId === s.id ? 'table-row-editing' : undefined}>
                        <td>{s.id}</td>
                        {editingId === s.id ? (
                          <>
                            <td>
                              <input
                                className="input-sm"
                                value={editForm.name}
                                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                              />
                            </td>
                            <td>
                              <select
                                className="input-sm"
                                value={editForm.campaign_id}
                                onChange={(e) => {
                                  const cid = e.target.value
                                  setEditForm((f) => ({ ...f, campaign_id: cid }))
                                  if (editForm.layout_id === 'full' && cid) {
                                    loadCampaignContentIds(cid).then((ids) => {
                                      setEditForm((f) => ({ ...f, layout_config: { ...(f.layout_config || {}), content_ids: ids } }))
                                    })
                                  }
                                }}
                              >
                                <option value="">선택</option>
                                {campaigns.map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <select
                                className="input-sm"
                                value={editForm.device_group_id}
                                onChange={(e) => setEditForm((f) => ({ ...f, device_group_id: e.target.value }))}
                              >
                                <option value="">선택</option>
                                {groups.map((g) => (
                                  <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <div className="layout-type-select layout-type-inline" role="group">
                                {LAYOUT_OPTIONS.map((opt) => (
                                  <label key={opt.value} className="layout-type-option">
                                    <input
                                      type="radio"
                                      name={`layout_edit_${s.id}`}
                                      value={opt.value}
                                      checked={(editForm.layout_id || 'full') === opt.value}
                                      onChange={() => {
                                        const v = opt.value
                                        const nextConfig = defaultZoneConfig(v) || (v === 'full' ? { content_ids: editForm.layout_config?.content_ids || [] } : editForm.layout_config)
                                        setEditForm((f) => ({ ...f, layout_id: v, layout_config: nextConfig }))
                                        if (v === 'full' && editForm.campaign_id && (!nextConfig?.content_ids?.length)) {
                                          loadCampaignContentIds(editForm.campaign_id).then((ids) => {
                                            setEditForm((f) => ({ ...f, layout_config: { ...(f.layout_config || {}), content_ids: ids } }))
                                          })
                                        }
                                      }}
                                    />
                                    <span>{opt.label}</span>
                                  </label>
                                ))}
                              </div>
                            </td>
                            <td>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={editForm.is_active}
                                  onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
                                />
                                활성
                              </label>
                            </td>
                            <td>
                              <button type="button" className="btn btn-sm btn-primary" onClick={saveSchedule}>
                                저장
                              </button>
                              <button type="button" className="btn btn-sm" onClick={cancelEdit}>
                                취소
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{s.name}</td>
                            <td>{s.campaign_id}</td>
                            <td>{s.device_group_id}</td>
                            <td>{s.layout_id}</td>
                            <td>{s.is_active ? '예' : '아니오'}</td>
                            <td>
                              <button type="button" className="btn btn-sm" onClick={() => startEdit(s)}>
                                수정
                              </button>
                              <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteSchedule(s)}>
                                삭제
                              </button>
                            </td>
                          </>
                        )}
                        </tr>
                        {editingId === s.id && editForm.layout_id === 'full' && (
                          <tr>
                            <td colSpan={7} className="table-inline-edit">
                              <div className="form-row form-section">
                                <label className="section-label">레이아웃에 쓸 이미지 선택 (전체 화면)</label>
                                <div className="content-check-list zone-select" style={{ maxHeight: '120px' }}>
                                  {contents.length === 0 ? (
                                    <span className="muted small">등록된 미디어가 없습니다.</span>
                                  ) : (
                                    contents.map((c) => (
                                      <label key={c.id} className="content-check-item">
                                        <input
                                          type="checkbox"
                                          checked={(editForm.layout_config?.content_ids || []).includes(c.id)}
                                          onChange={() => toggleFullContent(false, c.id)}
                                        />
                                        <span>{c.name || c.url || `#${c.id}`}</span>
                                      </label>
                                    ))
                                  )}
                                </div>
                              </div>
                              <div className="form-row form-section" style={{ marginBottom: 0 }}>
                                <label className="section-label">재생 순서 (▲▼로 변경)</label>
                                <div className="content-order-list">
                                  {(editForm.layout_config?.content_ids || []).map((cid, idx) => {
                                    const cont = contents.find((x) => x.id === cid)
                                    const label = cont ? (cont.name || cont.url || `#${cid}`) : `#${cid}`
                                    return (
                                      <div key={`${cid}-${idx}`} className="content-order-item">
                                        <span className="content-order-label">{label}</span>
                                        <button type="button" className="btn btn-sm" onClick={() => moveFullContentOrder(false, idx, -1)} disabled={idx === 0} title="위로">▲</button>
                                        <button type="button" className="btn btn-sm" onClick={() => moveFullContentOrder(false, idx, 1)} disabled={idx === (editForm.layout_config?.content_ids?.length || 0) - 1} title="아래로">▼</button>
                                      </div>
                                    )
                                  })}
                                </div>
                                {(editForm.layout_config?.content_ids?.length || 0) === 0 && (
                                  <p className="muted small">위에서 사용할 이미지를 체크하세요.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        {editingId === s.id && (editForm.layout_id === 'split_h' || editForm.layout_id === 'split_v') && (
                          <tr>
                            <td colSpan={7} className="table-inline-edit">
                              <div className="form-row form-section">
                                <label className="section-label">분할 레이아웃 · Zone 1 (왼쪽/위) 이미지 선택</label>
                                <div className="content-check-list zone-select" style={{ maxHeight: '120px' }}>
                                  {contents.length === 0 ? (
                                    <span className="muted small">등록된 미디어가 없습니다.</span>
                                  ) : (
                                    contents.map((c) => (
                                      <label key={c.id} className="content-check-item">
                                        <input type="checkbox" checked={((editForm.layout_config?.zones)?.[0]?.content_ids || []).includes(c.id)} onChange={() => toggleZoneContent(false, 0, c.id)} />
                                        <span>{c.name || c.url || `#${c.id}`}</span>
                                      </label>
                                    ))
                                  )}
                                </div>
                              </div>
                              <div className="form-row form-section" style={{ marginBottom: 0 }}>
                                <label className="section-label">분할 레이아웃 · Zone 2 (오른쪽/아래) 이미지 선택</label>
                                <div className="content-check-list zone-select" style={{ maxHeight: '120px' }}>
                                  {contents.length === 0 ? (
                                    <span className="muted small">등록된 미디어가 없습니다.</span>
                                  ) : (
                                    contents.map((c) => (
                                      <label key={c.id} className="content-check-item">
                                        <input type="checkbox" checked={((editForm.layout_config?.zones)?.[1]?.content_ids || []).includes(c.id)} onChange={() => toggleZoneContent(false, 1, c.id)} />
                                        <span>{c.name || c.url || `#${c.id}`}</span>
                                      </label>
                                    ))
                                  )}
                                </div>
                              </div>
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
              <h2>스케줄 추가</h2>
              <form onSubmit={handleAddSchedule}>
                <div className="form-row">
                  <label>이름</label>
                  <input
                    type="text"
                    placeholder="스케줄 이름"
                    value={addForm.name}
                    onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="form-row">
                  <label>캠페인</label>
                  <select
                    value={addForm.campaign_id}
                    onChange={(e) => {
                      const cid = e.target.value
                      setAddForm((f) => ({ ...f, campaign_id: cid }))
                      if ((addForm.layout_id || 'full') === 'full' && cid) {
                        loadCampaignContentIds(cid).then((ids) => {
                          setAddForm((f) => ({ ...f, layout_config: { ...(f.layout_config || {}), content_ids: ids } }))
                        })
                      }
                    }}
                  >
                    <option value="">선택</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (ID: {c.id})
                      </option>
                    ))}
                  </select>
                  {campaigns.length === 0 && (
                    <span className="muted small">캠페인을 먼저 만드세요.</span>
                  )}
                </div>
                <div className="form-row">
                  <label>디바이스 그룹</label>
                  <select
                    value={addForm.device_group_id}
                    onChange={(e) => setAddForm((f) => ({ ...f, device_group_id: e.target.value }))}
                  >
                    <option value="">선택</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} (ID: {g.id})
                      </option>
                    ))}
                  </select>
                  {groups.length === 0 && (
                    <span className="muted small">디바이스 페이지에서 그룹을 먼저 만드세요.</span>
                  )}
                </div>
                <div className="form-row">
                  <label>레이아웃</label>
                  <div className="layout-type-select" role="group" aria-label="레이아웃 종류">
                    {LAYOUT_OPTIONS.map((opt) => (
                      <label key={opt.value} className="layout-type-option">
                        <input
                          type="radio"
                          name="layout_id_add"
                          value={opt.value}
                          checked={(addForm.layout_id || 'full') === opt.value}
                          onChange={() => {
                            const v = opt.value
                            const nextConfig = defaultZoneConfig(v) || (v === 'full' ? { content_ids: addForm.layout_config?.content_ids || [] } : null)
                            setAddForm((f) => ({ ...f, layout_id: v, layout_config: nextConfig }))
                            if (v === 'full' && addForm.campaign_id) {
                              loadCampaignContentIds(addForm.campaign_id).then((ids) => {
                                setAddForm((f) => ({ ...f, layout_config: { ...(f.layout_config || {}), content_ids: ids } }))
                              })
                            }
                          }}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {addForm.layout_id === 'full' && (
                  <div className="form-row form-section">
                    <label className="section-label">레이아웃에 쓸 이미지 선택 (전체 화면)</label>
                    <p className="muted small">사용할 미디어를 체크하세요. 캠페인을 선택하면 해당 캠페인 미디어가 자동으로 채워집니다.</p>
                    <div className="content-check-list zone-select">
                      {contents.length === 0 ? (
                        <p className="muted small">미디어가 없습니다. 미디어 메뉴에서 먼저 이미지/영상을 추가하세요.</p>
                      ) : (
                        contents.map((c) => (
                          <label key={c.id} className="content-check-item">
                            <input
                              type="checkbox"
                              checked={(addForm.layout_config?.content_ids || []).includes(c.id)}
                              onChange={() => toggleFullContent(true, c.id)}
                            />
                            <span>{c.name || c.url || `#${c.id}`}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
                {addForm.layout_id === 'full' && (
                  <div className="form-row form-section">
                    <label className="section-label">재생 순서 (아래에서 위로 이동으로 순서 변경)</label>
                    <div className="content-order-list">
                      {(addForm.layout_config?.content_ids || []).map((cid, idx) => {
                        const cont = contents.find((x) => x.id === cid)
                        const label = cont ? (cont.name || cont.url || `#${cid}`) : `#${cid}`
                        return (
                          <div key={`${cid}-${idx}`} className="content-order-item">
                            <span className="content-order-label">{label}</span>
                            <button type="button" className="btn btn-sm" onClick={() => moveFullContentOrder(true, idx, -1)} disabled={idx === 0} title="위로">▲</button>
                            <button type="button" className="btn btn-sm" onClick={() => moveFullContentOrder(true, idx, 1)} disabled={idx === (addForm.layout_config?.content_ids?.length || 0) - 1} title="아래로">▼</button>
                          </div>
                        )
                      })}
                    </div>
                    {(addForm.layout_config?.content_ids?.length || 0) === 0 && (
                      <p className="muted small">위에서 사용할 이미지를 체크하면 여기 순서대로 재생됩니다.</p>
                    )}
                  </div>
                )}
                {(addForm.layout_id === 'split_h' || addForm.layout_id === 'split_v') && (
                  <>
                    <div className="form-row form-section">
                      <label className="section-label">분할 레이아웃 · Zone 1 (왼쪽/위) 이미지 선택</label>
                      <div className="content-check-list zone-select">
                        {contents.length === 0 ? (
                          <p className="muted small">미디어가 없습니다. 미디어 메뉴에서 먼저 이미지/영상을 추가하세요.</p>
                        ) : (
                          contents.map((c) => (
                            <label key={c.id} className="content-check-item">
                              <input
                                type="checkbox"
                                checked={((addForm.layout_config?.zones)?.[0]?.content_ids || []).includes(c.id)}
                                onChange={() => toggleZoneContent(true, 0, c.id)}
                              />
                              <span>{c.name || c.url || `#${c.id}`}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="form-row form-section">
                      <label className="section-label">분할 레이아웃 · Zone 2 (오른쪽/아래) 이미지 선택</label>
                      <div className="content-check-list zone-select">
                        {contents.length === 0 ? (
                          <p className="muted small">미디어가 없습니다.</p>
                        ) : (
                          contents.map((c) => (
                            <label key={c.id} className="content-check-item">
                              <input
                                type="checkbox"
                                checked={((addForm.layout_config?.zones)?.[1]?.content_ids || []).includes(c.id)}
                                onChange={() => toggleZoneContent(true, 1, c.id)}
                              />
                              <span>{c.name || c.url || `#${c.id}`}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
                <div className="form-row">
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? '등록 중…' : '스케줄 추가'}
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
