import { useEffect, useState, useRef } from 'react'
import { api, uploadFile } from '../lib/api'

export default function Contents() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ type: 'image', name: '', url: '', duration_sec: 10 })
  const [addForm, setAddForm] = useState({ type: 'image', name: '', url: '', duration_sec: 10 })
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const load = () => {
    setLoading(true)
    api('/contents')
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const startEdit = (c) => {
    setEditingId(c.id)
    setEditForm({
      type: c.type,
      name: c.name || '',
      url: c.url || '',
      duration_sec: c.duration_sec ?? 10,
    })
  }

  const saveEdit = async () => {
    if (editingId == null) return
    try {
      await api(`/contents/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      })
      setEditingId(null)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const cancelEdit = () => setEditingId(null)

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    uploadFile('/contents/upload', formData)
      .then((data) => {
        setAddForm((f) => {
          const name = f.name.trim() || file.name.replace(/\.[^.]+$/, '')
          const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase()
          const imageExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
          const videoExt = ['.mp4', '.webm', '.ogg', '.mov']
          let type = f.type
          if (imageExt.includes(ext)) type = 'image'
          else if (videoExt.includes(ext)) type = 'video'
          else if (ext === '.html' || ext === '.htm') type = 'html'
          return { ...f, url: data.url, name, type }
        })
      })
      .catch((err) => alert(err.message))
      .finally(() => {
        setUploading(false)
        e.target.value = ''
      })
  }

  const addContent = async (e) => {
    e.preventDefault()
    const { type, name, url, duration_sec } = addForm
    if (!url.trim()) {
      alert('URL을 입력하세요.')
      return
    }
    try {
      await api('/contents', {
        method: 'POST',
        body: JSON.stringify({
          type: type || 'image',
          name: name.trim() || url.trim(),
          url: url.trim(),
          duration_sec: duration_sec > 0 ? duration_sec : 10,
        }),
      })
      setAddForm({ type: 'image', name: '', url: '', duration_sec: 10 })
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const deleteContent = async (c) => {
    if (
      !window.confirm(
        `"${c.name || c.url}" 미디어를 삭제할까요?\n\n※ 캠페인 또는 스케줄에서 사용 중이면 삭제할 수 없습니다.`,
      )
    )
      return
    try {
      await api(`/contents/${c.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      const msg = e?.message || String(e)
      if (msg === 'Failed to fetch' || msg.includes('fetch')) {
        alert('삭제 요청이 실패했습니다. 백엔드가 실행 중인지 확인해 주세요.')
      } else {
        alert(msg)
      }
    }
  }

  if (loading && list.length === 0) return <div className="loading">로딩 중...</div>

  return (
    <div className="page">
      <h1>미디어 라이브러리</h1>

      <section className="card section">
        <h2>미디어 추가</h2>
        <form onSubmit={addContent} className="form-row">
          <select
            value={addForm.type}
            onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value }))}
          >
            <option value="image">이미지</option>
            <option value="video">동영상</option>
            <option value="html">HTML</option>
          </select>
          <input
            type="text"
            placeholder="이름 (선택)"
            value={addForm.name}
            onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            type="text"
            placeholder="URL *"
            value={addForm.url}
            onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.mp4,.webm,.ogg,.mov,.html,.htm"
            className="hidden-file-input"
            onChange={handleFileSelect}
            aria-label="파일 선택"
          />
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="탐색기에서 파일 선택 후 업로드"
          >
            {uploading ? '업로드 중…' : '📁'}
          </button>
          <input
            type="number"
            min={1}
            placeholder="재생(초)"
            value={addForm.duration_sec || ''}
            onChange={(e) => setAddForm((f) => ({ ...f, duration_sec: parseInt(e.target.value, 10) || 10 }))}
          />
          <button type="submit" className="btn btn-primary">
            추가
          </button>
        </form>
      </section>

      <section className="card section">
        <h2>미디어 목록</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>이름</th>
                <th>타입</th>
                <th>재생(초)</th>
                <th>URL</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6}>없습니다.</td>
                </tr>
              ) : (
                list.map((c) => (
                  <tr key={c.id}>
                    {editingId === c.id ? (
                      <>
                        <td>{c.id}</td>
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
                            value={editForm.type}
                            onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}
                          >
                            <option value="image">이미지</option>
                            <option value="video">동영상</option>
                            <option value="html">HTML</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            className="input-sm"
                            style={{ width: '70px' }}
                            value={editForm.duration_sec}
                            onChange={(e) => setEditForm((f) => ({ ...f, duration_sec: parseInt(e.target.value, 10) || 10 }))}
                          />
                        </td>
                        <td>
                          <input
                            className="input-sm"
                            style={{ minWidth: '120px' }}
                            value={editForm.url}
                            onChange={(e) => setEditForm((f) => ({ ...f, url: e.target.value }))}
                          />
                        </td>
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
                        <td>{c.id}</td>
                        <td>{c.name}</td>
                        <td>{c.type}</td>
                        <td>{c.duration_sec}</td>
                        <td className="url-cell">{c.url}</td>
                        <td>
                          <button type="button" className="btn btn-sm" onClick={() => startEdit(c)}>
                            수정
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => deleteContent(c)}
                          >
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
