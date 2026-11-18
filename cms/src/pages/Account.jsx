import { useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

export default function Account() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')
    setError('')
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호 확인이 일치하지 않습니다.')
      return
    }
    if (newPassword.trim().length < 4) {
      setError('새 비밀번호는 4자 이상이어야 합니다.')
      return
    }
    setSaving(true)
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword.trim(),
        }),
      })
      setMessage('비밀번호가 변경되었습니다.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message || '비밀번호 변경에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <h1>계정</h1>
      <section className="card section" style={{ maxWidth: 420 }}>
        <p className="small" style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          로그인 아이디: <strong>{user?.email || '-'}</strong>
        </p>
        <h2>비밀번호 변경</h2>
        <form onSubmit={handleSubmit}>
          {error && <div className="error">{error}</div>}
          {message && <p className="muted small text-success">{message}</p>}
          <div className="form-row">
            <label>현재 비밀번호</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <label>새 비밀번호</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={4}
            />
          </div>
          <div className="form-row">
            <label>새 비밀번호 확인</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={4}
            />
          </div>
          <div className="form-row">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '변경 중…' : '비밀번호 변경'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
